import { Effect, Schema } from 'effect'
import { StorageUnavailable } from '@feedbax/contracts'
import {
  FeedbackItemId,
  PrivateIdentity,
  VisitorIdentityId,
  type PrivateIdentity as PrivateIdentityType,
} from '@feedbax/domain'
import type { InteractionStoreService } from '@feedbax/storage'

export interface NotionInteractionRecord {
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}
export interface NotionInteractionApi {
  readonly findOne: (
    dataSourceId: string,
    field: string,
    value: string,
  ) => Promise<NotionInteractionRecord | undefined>
  readonly create: (
    dataSourceId: string,
    values: Readonly<Record<string, unknown>>,
  ) => Promise<NotionInteractionRecord>
  readonly update: (
    pageId: string,
    values: Readonly<Record<string, unknown>>,
  ) => Promise<void>
}
export interface NotionInteractionStoreConfig {
  readonly identities: {
    readonly dataSourceId: string
    readonly fields: {
      readonly id: string
      readonly subject: string
      readonly kind: string
      readonly displayName: string
      readonly email: string
      readonly avatarUrl: string
    }
  }
  readonly votes: {
    readonly dataSourceId: string
    readonly fields: {
      readonly key: string
      readonly feedbackId: string
      readonly subject: string
      readonly active: string
      readonly requestId: string
    }
  }
  readonly replay: {
    readonly dataSourceId: string
    readonly fields: { readonly key: string; readonly expiresAt: string }
  }
}

const unavailable = () =>
  new StorageUnavailable({
    message: 'Notion interaction storage is temporarily unavailable.',
    retryable: true,
  })
const attempt = <A>(work: () => Promise<A>) =>
  Effect.tryPromise({ try: work, catch: unavailable })
const stringValue = (record: NotionInteractionRecord, field: string) => {
  const value = record.values[field]
  return typeof value === 'string' ? value : undefined
}

export const createNotionInteractionStore = (
  api: NotionInteractionApi,
  config: NotionInteractionStoreConfig,
): InteractionStoreService => ({
  findIdentity: (id) =>
    attempt(async () => {
      const fields = config.identities.fields
      const record = await api.findOne(
        config.identities.dataSourceId,
        fields.id,
        id,
      )
      if (!record) return undefined
      return Schema.decodeUnknownSync(PrivateIdentity)({
        id: Schema.decodeUnknownSync(VisitorIdentityId)(
          stringValue(record, fields.id),
        ),
        subject: stringValue(record, fields.subject),
        kind: stringValue(record, fields.kind),
        displayName: stringValue(record, fields.displayName),
        ...(stringValue(record, fields.email)
          ? { email: stringValue(record, fields.email) }
          : {}),
        ...(stringValue(record, fields.avatarUrl)
          ? { avatarUrl: stringValue(record, fields.avatarUrl) }
          : {}),
      })
    }),
  saveIdentity: (identity: PrivateIdentityType) =>
    attempt(async () => {
      const fields = config.identities.fields
      const values = {
        [fields.id]: identity.id,
        [fields.subject]: identity.subject,
        [fields.kind]: identity.kind,
        [fields.displayName]: identity.displayName,
        [fields.email]: identity.email ?? null,
        [fields.avatarUrl]: identity.avatarUrl?.toString() ?? null,
      }
      const existing = await api.findOne(
        config.identities.dataSourceId,
        fields.id,
        identity.id,
      )
      if (existing) await api.update(existing.id, values)
      else await api.create(config.identities.dataSourceId, values)
    }),
  setVote: (feedbackId, subject, voted, requestId) =>
    attempt(async () => {
      const fields = config.votes.fields
      const key = `${feedbackId}:${subject}`
      const values = {
        [fields.key]: key,
        [fields.feedbackId]: feedbackId,
        [fields.subject]: subject,
        [fields.active]: voted,
        [fields.requestId]: requestId,
      }
      const existing = await api.findOne(
        config.votes.dataSourceId,
        fields.key,
        key,
      )
      if (existing) await api.update(existing.id, values)
      else await api.create(config.votes.dataSourceId, values)
    }),
  hasVote: (feedbackId, subject) =>
    attempt(async () => {
      const fields = config.votes.fields
      const record = await api.findOne(
        config.votes.dataSourceId,
        fields.key,
        `${feedbackId}:${subject}`,
      )
      return record?.values[fields.active] === true
    }),
  consumeReplayKey: (key, expiresAt) =>
    attempt(async () => {
      const fields = config.replay.fields
      const existing = await api.findOne(
        config.replay.dataSourceId,
        fields.key,
        key,
      )
      if (existing) return false
      await api.create(config.replay.dataSourceId, {
        [fields.key]: key,
        [fields.expiresAt]: expiresAt.toISOString(),
      })
      return true
    }),
})

export const decodeInteractionFeedbackId = (value: unknown) =>
  Schema.decodeUnknownSync(FeedbackItemId)(value)
