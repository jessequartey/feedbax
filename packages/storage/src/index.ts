import { Context, Effect } from 'effect'
import type { StorageUnavailable } from '@feedbax/contracts'
import type {
  FeedbackItemId,
  PrivateIdentity,
  VisitorIdentityId,
} from '@feedbax/domain'

export interface InteractionStoreService {
  readonly findIdentity: (
    id: VisitorIdentityId,
  ) => Effect.Effect<PrivateIdentity | undefined, StorageUnavailable>
  readonly saveIdentity: (
    identity: PrivateIdentity,
  ) => Effect.Effect<void, StorageUnavailable>
  readonly setVote: (
    feedbackId: FeedbackItemId,
    subject: string,
    voted: boolean,
    requestId: string,
  ) => Effect.Effect<void, StorageUnavailable>
  readonly hasVote: (
    feedbackId: FeedbackItemId,
    subject: string,
  ) => Effect.Effect<boolean, StorageUnavailable>
  readonly consumeReplayKey: (
    key: string,
    expiresAt: Date,
  ) => Effect.Effect<boolean, StorageUnavailable>
}
export class InteractionStore extends Context.Tag('@feedbax/InteractionStore')<
  InteractionStore,
  InteractionStoreService
>() {}
