import { Effect, Layer } from 'effect'
import {
  FeedbackRepository,
  type FeedbackRepositoryService,
} from '@feedbax/connector-sdk'
import { ConnectorUnavailable } from '@feedbax/contracts'
import type { PublicFeedbackItem } from '@feedbax/domain'

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
