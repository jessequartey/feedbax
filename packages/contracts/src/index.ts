import { Schema } from 'effect'
import {
  FeedbackItemId,
  PublicComment,
  PublicFeedbackItem,
} from '@feedbax/domain'

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  'ValidationError',
  {
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {}
export class IdentityRequired extends Schema.TaggedError<IdentityRequired>()(
  'IdentityRequired',
  { message: Schema.String },
) {}
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()(
  'PermissionDenied',
  { message: Schema.String },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  message: Schema.String,
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()('Conflict', {
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  'RateLimited',
  {
    message: Schema.String,
    retryAfterSeconds: Schema.Int.pipe(Schema.positive()),
  },
) {}
export class CapabilityUnavailable extends Schema.TaggedError<CapabilityUnavailable>()(
  'CapabilityUnavailable',
  { message: Schema.String, capability: Schema.String },
) {}
export class ConnectorUnavailable extends Schema.TaggedError<ConnectorUnavailable>()(
  'ConnectorUnavailable',
  { message: Schema.String, retryable: Schema.Boolean },
) {}
export class StorageUnavailable extends Schema.TaggedError<StorageUnavailable>()(
  'StorageUnavailable',
  { message: Schema.String, retryable: Schema.Boolean },
) {}
export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  'ConfigurationError',
  { message: Schema.String, owner: Schema.String },
) {}
export class InternalError extends Schema.TaggedError<InternalError>()(
  'InternalError',
  { message: Schema.String, requestId: Schema.String },
) {}

export const PublicError = Schema.Union(
  ValidationError,
  IdentityRequired,
  PermissionDenied,
  NotFound,
  Conflict,
  RateLimited,
  CapabilityUnavailable,
  ConnectorUnavailable,
  StorageUnavailable,
  ConfigurationError,
  InternalError,
)

export const PageQuery = Schema.Struct({
  search: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optionalWith(Schema.Int.pipe(Schema.between(1, 100)), {
    default: () => 20,
  }),
})
export const FeedbackPage = Schema.Struct({
  items: Schema.Array(PublicFeedbackItem),
  nextCursor: Schema.NullOr(Schema.String),
})
export const GetFeedbackInput = Schema.Struct({ id: FeedbackItemId })
export const SubmitFeedbackInput = Schema.Struct({
  clientRequestId: Schema.UUID,
  title: Schema.String.pipe(
    Schema.trimmed(),
    Schema.minLength(1),
    Schema.maxLength(200),
  ),
  description: Schema.String.pipe(
    Schema.trimmed(),
    Schema.minLength(1),
    Schema.maxLength(20_000),
  ),
})
export const SetVoteInput = Schema.Struct({
  clientRequestId: Schema.UUID,
  feedbackItemId: FeedbackItemId,
  voted: Schema.Boolean,
})
export const CreateCommentInput = Schema.Struct({
  clientRequestId: Schema.UUID,
  feedbackItemId: FeedbackItemId,
  body: Schema.String.pipe(
    Schema.trimmed(),
    Schema.minLength(1),
    Schema.maxLength(10_000),
  ),
})
export const OperationSuccess = Schema.Union(
  PublicFeedbackItem,
  PublicComment,
  FeedbackPage,
)
export const OperationResult = Schema.Union(
  Schema.Struct({ ok: Schema.Literal(true), value: OperationSuccess }),
  Schema.Struct({ ok: Schema.Literal(false), error: PublicError }),
)

export type PageQuery = typeof PageQuery.Type
export type FeedbackPage = typeof FeedbackPage.Type
export type SubmitFeedbackInput = typeof SubmitFeedbackInput.Type
export type SetVoteInput = typeof SetVoteInput.Type
export type CreateCommentInput = typeof CreateCommentInput.Type
export type PublicError = typeof PublicError.Type
