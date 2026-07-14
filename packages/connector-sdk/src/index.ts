import { Context, Effect } from 'effect'
import type {
  ConnectorUnavailable,
  FeedbackPage,
  PageQuery,
  SubmitFeedbackInput,
} from '@feedbax/contracts'
import type { FeedbackItemId, PublicFeedbackItem } from '@feedbax/domain'

export type ConnectorCapability =
  | 'feedback.read'
  | 'feedback.write'
  | 'feedback.search'
  | 'comments.read'
  | 'comments.write'
  | 'votes.read'
  | 'votes.atomic'
  | 'roadmap.read'
  | 'changelog.read'
  | 'changelog.write'
  | 'webhooks'
export interface ConnectorDescriptor {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ReadonlySet<ConnectorCapability>
}
export interface ConnectorHealth {
  readonly ok: boolean
  readonly checks: readonly {
    readonly code: string
    readonly status: 'pass' | 'fail' | 'warning'
    readonly summary: string
    readonly repair?: string
  }[]
}
export interface FeedbackRepositoryService {
  readonly descriptor: ConnectorDescriptor
  readonly healthCheck: Effect.Effect<ConnectorHealth, ConnectorUnavailable>
  readonly list: (
    query: PageQuery,
  ) => Effect.Effect<FeedbackPage, ConnectorUnavailable>
  readonly get: (
    id: FeedbackItemId,
  ) => Effect.Effect<PublicFeedbackItem | undefined, ConnectorUnavailable>
  readonly submit: (
    input: SubmitFeedbackInput,
  ) => Effect.Effect<PublicFeedbackItem, ConnectorUnavailable>
}
export class FeedbackRepository extends Context.Tag(
  '@feedbax/FeedbackRepository',
)<FeedbackRepository, FeedbackRepositoryService>() {}
export const hasCapability = (
  descriptor: ConnectorDescriptor,
  capability: ConnectorCapability,
) => descriptor.capabilities.has(capability)
