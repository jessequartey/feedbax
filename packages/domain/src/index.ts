import { Schema } from 'effect'

const identifier = <Name extends string>(name: Name) =>
  Schema.String.pipe(Schema.trimmed(), Schema.minLength(1), Schema.brand(name))

export const FeedbackItemId = identifier('FeedbackItemId')
export const CommentId = identifier('CommentId')
export const VisitorIdentityId = identifier('VisitorIdentityId')
export const StatusId = identifier('StatusId')
export const CategoryId = identifier('CategoryId')
export const TagId = identifier('TagId')
export const ChangelogEntryId = identifier('ChangelogEntryId')
export const Timestamp = Schema.DateTimeUtc

export const Status = Schema.Struct({
  id: StatusId,
  label: Schema.NonEmptyTrimmedString,
  terminal: Schema.optionalWith(Schema.Boolean, { default: () => false }),
})

export const PublicAuthor = Schema.Struct({
  id: VisitorIdentityId,
  displayName: Schema.NonEmptyTrimmedString,
  avatarUrl: Schema.optional(Schema.URL),
})

export const PrivateIdentity = Schema.Struct({
  ...PublicAuthor.fields,
  subject: Schema.NonEmptyTrimmedString,
  kind: Schema.Literal('anonymous', 'email', 'handoff'),
  email: Schema.optional(Schema.NonEmptyTrimmedString),
})

export const PublicFeedbackItem = Schema.Struct({
  id: FeedbackItemId,
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
  status: Schema.NullOr(Status),
  author: PublicAuthor,
  voteCount: Schema.NonNegativeInt,
  commentCount: Schema.NonNegativeInt,
  createdAt: Timestamp,
  updatedAt: Timestamp,
})

export const PublicComment = Schema.Struct({
  id: CommentId,
  feedbackItemId: FeedbackItemId,
  body: Schema.String.pipe(
    Schema.trimmed(),
    Schema.minLength(1),
    Schema.maxLength(10_000),
  ),
  author: PublicAuthor,
  createdAt: Timestamp,
})

export const ChangelogEntry = Schema.Struct({
  id: ChangelogEntryId,
  slug: Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
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
  publishedAt: Timestamp,
  linkedFeedbackItemIds: Schema.Array(FeedbackItemId),
})

export type FeedbackItemId = typeof FeedbackItemId.Type
export type CommentId = typeof CommentId.Type
export type VisitorIdentityId = typeof VisitorIdentityId.Type
export type PublicFeedbackItem = typeof PublicFeedbackItem.Type
export type PublicComment = typeof PublicComment.Type
export type PrivateIdentity = typeof PrivateIdentity.Type
export type ChangelogEntry = typeof ChangelogEntry.Type
