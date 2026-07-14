import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { FeedbackItemId, PrivateIdentity } from '@feedbax/domain'
import {
  createNotionInteractionStore,
  type NotionInteractionApi,
  type NotionInteractionRecord,
} from '../src/interaction-store.js'

const config = {
  identities: {
    dataSourceId: 'identities',
    fields: {
      id: 'id',
      subject: 'subject',
      kind: 'kind',
      displayName: 'name',
      email: 'email',
      avatarUrl: 'avatar',
    },
  },
  votes: {
    dataSourceId: 'votes',
    fields: {
      key: 'key',
      feedbackId: 'feedback',
      subject: 'subject',
      active: 'active',
      requestId: 'request',
    },
  },
  replay: {
    dataSourceId: 'replay',
    fields: { key: 'key', expiresAt: 'expires' },
  },
} as const

const fakeApi = () => {
  const records = new Map<string, NotionInteractionRecord>()
  let next = 0
  const api: NotionInteractionApi = {
    findOne: async (source, field, value) =>
      [...records.values()].find(
        (record) =>
          record.values.source === source && record.values[field] === value,
      ),
    create: async (source, values) => {
      const record = { id: `page-${++next}`, values: { source, ...values } }
      records.set(record.id, record)
      return record
    },
    update: async (id, values) => {
      const record = records.get(id)
      if (!record) throw new Error('missing page')
      records.set(id, { id, values: { ...record.values, ...values } })
    },
  }
  return { api, records }
}

describe('Notion interaction storage', () => {
  it('keeps private email in the identity record and resolves it by opaque id', async () => {
    const { api, records } = fakeApi()
    const store = createNotionInteractionStore(api, config)
    const identity = Schema.decodeUnknownSync(PrivateIdentity)({
      id: 'identity_opaque',
      subject: 'opaque',
      kind: 'email',
      displayName: 'Customer',
      email: 'private@example.com',
    })
    await Effect.runPromise(store.saveIdentity(identity))
    await expect(
      Effect.runPromise(store.findIdentity(identity.id)),
    ).resolves.toEqual(identity)
    expect(JSON.stringify([...records.values()])).toContain(
      'private@example.com',
    )
  })

  it('uses a deterministic opaque vote key and updates idempotently', async () => {
    const { api, records } = fakeApi()
    const store = createNotionInteractionStore(api, config)
    const feedbackId = Schema.decodeUnknownSync(FeedbackItemId)('feedback-one')
    await Effect.runPromise(
      store.setVote(feedbackId, 'opaque-subject', true, 'request-1'),
    )
    await Effect.runPromise(
      store.setVote(feedbackId, 'opaque-subject', false, 'request-2'),
    )
    await expect(
      Effect.runPromise(store.hasVote(feedbackId, 'opaque-subject')),
    ).resolves.toBe(false)
    expect(
      [...records.values()].filter(
        (record) => record.values.source === 'votes',
      ),
    ).toHaveLength(1)
  })

  it('consumes replay keys once and classifies provider failures safely', async () => {
    const { api } = fakeApi()
    const store = createNotionInteractionStore(api, config)
    await expect(
      Effect.runPromise(store.consumeReplayKey('jti', new Date())),
    ).resolves.toBe(true)
    await expect(
      Effect.runPromise(store.consumeReplayKey('jti', new Date())),
    ).resolves.toBe(false)
    const unavailable = createNotionInteractionStore(
      {
        ...api,
        findOne: async () => {
          throw new Error('raw provider secret')
        },
      },
      config,
    )
    await expect(
      Effect.runPromise(
        unavailable.hasVote(
          Schema.decodeUnknownSync(FeedbackItemId)('feedback-one'),
          'subject',
        ),
      ),
    ).rejects.not.toThrow(/raw provider secret/)
  })
})
