import { Effect, Schema } from 'effect'
import type { FeedbackRepositoryService } from '@feedbax/connector-sdk'
import { ConnectorUnavailable } from '@feedbax/contracts'
import {
  PublicFeedbackItem,
  type PublicFeedbackItem as PublicFeedbackItemType,
} from '@feedbax/domain'
import type { PublicUser } from '@feedbax/core'
import type { createNotionMutationService } from './mutations.js'
import type { createNotionReadClient } from './reads.js'

type Reader = ReturnType<typeof createNotionReadClient>
type Mutations = ReturnType<typeof createNotionMutationService>

export interface NotionEffectAdapterOptions {
  readonly reader: Reader
  readonly mutations: Mutations
  readonly author: PublicUser
  readonly healthCheck: () => Promise<{
    readonly ok: boolean
    readonly checks: readonly {
      readonly code: string
      readonly status: 'pass' | 'fail'
      readonly summary: string
      readonly repair?: string
    }[]
  }>
}

const unavailable = () =>
  new ConnectorUnavailable({
    message: 'Notion is temporarily unavailable.',
    retryable: true,
  })

const project = (item: import('@feedbax/core').PublicFeedbackItem) =>
  Schema.decodeUnknownSync(PublicFeedbackItem)({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status
      ? {
          id: item.status.id,
          label: item.status.name,
          terminal: item.status.isTerminal,
        }
      : null,
    author: item.author,
    voteCount: item.voteCount,
    commentCount: item.commentCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })

export const createNotionEffectAdapter = (
  options: NotionEffectAdapterOptions,
): FeedbackRepositoryService => ({
  descriptor: {
    id: 'notion',
    displayName: 'Notion',
    capabilities: new Set([
      'feedback.read',
      'feedback.write',
      'feedback.search',
      'comments.read',
      'comments.write',
      'votes.read',
      'roadmap.read',
      'changelog.read',
      'changelog.write',
    ]),
  },
  healthCheck: Effect.tryPromise({
    try: async () => {
      const result = await options.healthCheck()
      return {
        ok: result.ok,
        checks: result.checks.map((check) => ({ ...check })),
      }
    },
    catch: unavailable,
  }),
  list: (query) =>
    Effect.tryPromise({
      try: async () => {
        const result = await options.reader.listFeedback(
          {
            sort: 'newest',
            ...(query.search ? { search: query.search } : {}),
          },
          {
            pageSize: query.limit,
            ...(query.cursor ? { cursor: query.cursor } : {}),
          },
        )
        return {
          items: result.value.items.map(project),
          nextCursor: result.value.nextCursor ?? null,
        }
      },
      catch: unavailable,
    }),
  get: (id) =>
    Effect.tryPromise({
      try: async () => {
        const item = await options.reader.getFeedback(id)
        return item ? project(item) : undefined
      },
      catch: unavailable,
    }),
  submit: (input) =>
    Effect.tryPromise({
      try: async (): Promise<PublicFeedbackItemType> =>
        project(
          await options.mutations.submit(
            {
              title: input.title,
              description: input.description,
              type: 'improvement',
              tagIds: [],
            },
            options.author,
          ),
        ),
      catch: unavailable,
    }),
})
