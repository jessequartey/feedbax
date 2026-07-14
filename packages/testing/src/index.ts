import { Effect, Layer } from 'effect'
import {
  FeedbackRepository,
  type FeedbackRepositoryService,
} from '@feedbax/connector-sdk'
import { ConnectorUnavailable } from '@feedbax/contracts'
import type { PublicFeedbackItem } from '@feedbax/domain'
import type {
  FeedbackItemId,
  PrivateIdentity,
  VisitorIdentityId,
} from '@feedbax/domain'
import {
  InteractionStore,
  type InteractionStoreService,
} from '@feedbax/storage'

export const inMemoryFeedbackLayer = (
  seed: readonly PublicFeedbackItem[] = [],
) => {
  const items = [...seed]
  const service: FeedbackRepositoryService = {
    descriptor: {
      id: 'memory',
      displayName: 'In-memory fixtures',
      capabilities: new Set([
        'feedback.read',
        'feedback.write',
        'feedback.search',
      ]),
    },
    healthCheck: Effect.succeed({
      ok: true,
      checks: [
        {
          code: 'MEMORY_OK',
          status: 'pass',
          summary: 'Fixture connector is ready.',
        },
      ],
    }),
    list: ({ search, limit }) =>
      Effect.succeed({
        items: items
          .filter(
            (item) =>
              !search ||
              `${item.title} ${item.description}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .slice(0, limit),
        nextCursor: null,
      }),
    get: (id) => Effect.succeed(items.find((item) => item.id === id)),
    submit: (input) =>
      Effect.fail(
        new ConnectorUnavailable({
          message: `Fixture mutation ${input.clientRequestId} is not configured.`,
          retryable: false,
        }),
      ),
  }
  return Layer.succeed(FeedbackRepository, service)
}

export const inMemoryInteractionLayer = () => {
  const identities = new Map<VisitorIdentityId, PrivateIdentity>()
  const votes = new Set<string>()
  const replayKeys = new Set<string>()
  const service: InteractionStoreService = {
    findIdentity: (id) => Effect.succeed(identities.get(id)),
    saveIdentity: (value) =>
      Effect.sync(() => void identities.set(value.id, value)),
    setVote: (feedbackId, subject, voted) =>
      Effect.sync(() => {
        const key = `${feedbackId}:${subject}`
        if (voted) votes.add(key)
        else votes.delete(key)
      }),
    hasVote: (feedbackId: FeedbackItemId, subject: string) =>
      Effect.succeed(votes.has(`${feedbackId}:${subject}`)),
    consumeReplayKey: (key) =>
      Effect.sync(() => {
        if (replayKeys.has(key)) return false
        replayKeys.add(key)
        return true
      }),
  }
  return Layer.succeed(InteractionStore, service)
}
