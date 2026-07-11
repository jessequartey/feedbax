import { z } from 'zod'

const id = <T extends string>(brand: T) => z.string().trim().min(1).brand(brand)

export const FeedbackItemIdSchema = id('FeedbackItemId')
export const UserIdSchema = id('UserId')
export const CommentIdSchema = id('CommentId')
export const VoteIdSchema = id('VoteId')
export const StatusIdSchema = id('StatusId')
export const CategoryIdSchema = id('CategoryId')
export const TagIdSchema = id('TagId')
export const RoadmapEntryIdSchema = id('RoadmapEntryId')
export const ChangelogEntryIdSchema = id('ChangelogEntryId')

export type FeedbackItemId = z.infer<typeof FeedbackItemIdSchema>
/** @deprecated Use FeedbackItemId. */
export type ItemId = FeedbackItemId
export type UserId = z.infer<typeof UserIdSchema>
export type CommentId = z.infer<typeof CommentIdSchema>
export type VoteId = z.infer<typeof VoteIdSchema>
export type StatusId = z.infer<typeof StatusIdSchema>
export type CategoryId = z.infer<typeof CategoryIdSchema>
export type TagId = z.infer<typeof TagIdSchema>
export type RoadmapEntryId = z.infer<typeof RoadmapEntryIdSchema>
export type ChangelogEntryId = z.infer<typeof ChangelogEntryIdSchema>

export const TimestampSchema = z.iso.datetime({ offset: true })
export type Timestamp = z.infer<typeof TimestampSchema>

const optionalUrl = z.url().optional()
const orderedTaxonomyShape = {
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  order: z.number().int().nonnegative(),
} as const

export const PublicUserSchema = z.strictObject({
  id: UserIdSchema,
  displayName: z.string().trim().min(1),
  avatarUrl: optionalUrl,
})
export type PublicUser = z.infer<typeof PublicUserSchema>

export const PrivateUserSchema = PublicUserSchema.extend({
  identitySubject: z.string().trim().min(1),
  email: z.email().optional(),
})
export type PrivateUser = z.infer<typeof PrivateUserSchema>

export const StatusSchema = z.strictObject({
  id: StatusIdSchema,
  ...orderedTaxonomyShape,
  isTerminal: z.boolean().default(false),
})
export type Status = z.infer<typeof StatusSchema>

export const CategorySchema = z.strictObject({ id: CategoryIdSchema, ...orderedTaxonomyShape })
export type Category = z.infer<typeof CategorySchema>

export const TagSchema = z.strictObject({ id: TagIdSchema, ...orderedTaxonomyShape })
export type Tag = z.infer<typeof TagSchema>

export const ConnectorReferenceSchema = z.strictObject({
  connectorId: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
})
export type ConnectorReference = z.infer<typeof ConnectorReferenceSchema>

const feedbackContentShape = {
  id: FeedbackItemIdSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  status: StatusSchema.nullable(),
  category: CategorySchema.nullable(),
  tags: z.array(TagSchema).readonly(),
  voteCount: z.number().int().nonnegative(),
  hasViewerVoted: z.boolean().optional(),
  commentCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
} as const

export const PublicFeedbackItemSchema = z.strictObject({
  ...feedbackContentShape,
  author: PublicUserSchema,
})
export type PublicFeedbackItem = z.infer<typeof PublicFeedbackItemSchema>

export const PrivateFeedbackItemSchema = z.strictObject({
  ...feedbackContentShape,
  author: PrivateUserSchema,
  connector: ConnectorReferenceSchema,
})
export type PrivateFeedbackItem = z.infer<typeof PrivateFeedbackItemSchema>

const commentShape = {
  id: CommentIdSchema,
  feedbackItemId: FeedbackItemIdSchema,
  body: z.string().trim().min(1).max(10_000),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
} as const

export const PublicCommentSchema = z.strictObject({ ...commentShape, author: PublicUserSchema })
export type PublicComment = z.infer<typeof PublicCommentSchema>

export const PrivateCommentSchema = z.strictObject({
  ...commentShape,
  author: PrivateUserSchema,
  connector: ConnectorReferenceSchema,
})
export type PrivateComment = z.infer<typeof PrivateCommentSchema>

export const PrivateVoteSchema = z.strictObject({
  id: VoteIdSchema,
  feedbackItemId: FeedbackItemIdSchema,
  voter: PrivateUserSchema,
  createdAt: TimestampSchema,
  connector: ConnectorReferenceSchema.optional(),
})
export type PrivateVote = z.infer<typeof PrivateVoteSchema>

const editorialShape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  linkedFeedbackItemIds: z.array(FeedbackItemIdSchema).readonly().default([]),
  publishedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
} as const

export const RoadmapEntrySchema = z.strictObject({
  id: RoadmapEntryIdSchema,
  ...editorialShape,
  status: StatusSchema.nullable(),
})
export type RoadmapEntry = z.infer<typeof RoadmapEntrySchema>

export const ChangelogEntrySchema = z.strictObject({
  id: ChangelogEntryIdSchema,
  ...editorialShape,
  version: z.string().trim().min(1).optional(),
})
export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>

export const SubmitFeedbackInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  categoryId: CategoryIdSchema.optional(),
  tagIds: z.array(TagIdSchema).max(20).readonly().default([]),
})
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInputSchema>

export const CreateCommentInputSchema = z.strictObject({
  feedbackItemId: FeedbackItemIdSchema,
  body: z.string().trim().min(1).max(10_000),
})
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>

export const SetVoteInputSchema = z.strictObject({
  feedbackItemId: FeedbackItemIdSchema,
  voted: z.boolean(),
})
export type SetVoteInput = z.infer<typeof SetVoteInputSchema>

export const FeedbackSortSchema = z.enum(['newest', 'oldest', 'most-voted', 'recently-updated'])
export const FeedbackFilterSchema = z.strictObject({
  search: z.string().trim().min(1).max(200).optional(),
  statusIds: z.array(StatusIdSchema).readonly().optional(),
  categoryId: CategoryIdSchema.optional(),
  tagIds: z.array(TagIdSchema).readonly().optional(),
  authorId: UserIdSchema.optional(),
  roadmapEntryId: RoadmapEntryIdSchema.optional(),
  sort: FeedbackSortSchema.default('newest'),
})
export type FeedbackFilter = z.infer<typeof FeedbackFilterSchema>

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
export const CursorPageRequestSchema = z.strictObject({
  cursor: z.string().min(1).optional(),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})
export type CursorPageRequest = z.infer<typeof CursorPageRequestSchema>

export const cursorPageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.strictObject({
    items: z.array(itemSchema).readonly(),
    nextCursor: z.string().min(1).optional(),
    hasMore: z.boolean(),
  }).superRefine((page, context) => {
    if (page.hasMore && page.nextCursor === undefined) {
      context.addIssue({ code: 'custom', message: 'nextCursor is required when hasMore is true', path: ['nextCursor'] })
    }
    if (!page.hasMore && page.nextCursor !== undefined) {
      context.addIssue({ code: 'custom', message: 'nextCursor must be omitted when hasMore is false', path: ['nextCursor'] })
    }
  })

export type CursorPage<T> = Readonly<{ items: readonly T[]; nextCursor?: string; hasMore: boolean }>
export const PublicFeedbackPageSchema = cursorPageSchema(PublicFeedbackItemSchema)
export type PublicFeedbackPage = z.infer<typeof PublicFeedbackPageSchema>

export const connectorErrorCodes = [
  'configuration', 'authentication', 'authorization', 'validation', 'unavailable',
  'rate-limited', 'not-found', 'conflict', 'unknown',
] as const
export const ConnectorErrorCodeSchema = z.enum(connectorErrorCodes)
export type ConnectorErrorCode = z.infer<typeof ConnectorErrorCodeSchema>

const publicErrorShape = {
  code: ConnectorErrorCodeSchema,
  message: z.string().trim().min(1),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
} as const
export const PublicConnectorErrorSchema = z.strictObject(publicErrorShape)
export type PublicConnectorError = z.infer<typeof PublicConnectorErrorSchema>
export const PrivateConnectorErrorSchema = z.strictObject({
  ...publicErrorShape,
  connectorId: z.string().trim().min(1),
  diagnosticMessage: z.string().trim().min(1).optional(),
  cause: z.unknown().optional(),
})
export type PrivateConnectorError = z.infer<typeof PrivateConnectorErrorSchema>

export const connectorCapabilities = ['comments', 'atomicVoting', 'webhooks'] as const
export const ConnectorCapabilitySchema = z.enum(connectorCapabilities)
export type ConnectorCapability = z.infer<typeof ConnectorCapabilitySchema>
export const ConnectorDescriptorSchema = z.strictObject({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  capabilities: z.array(ConnectorCapabilitySchema).readonly(),
})
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>

export const ConnectorFeedbackRecordSchema = PrivateFeedbackItemSchema
export const ConnectorFeedbackPageSchema = cursorPageSchema(ConnectorFeedbackRecordSchema)
export type ConnectorFeedbackRecord = z.infer<typeof ConnectorFeedbackRecordSchema>
export type ConnectorFeedbackPage = z.infer<typeof ConnectorFeedbackPageSchema>

export const toPublicUser = (user: PrivateUser): PublicUser => PublicUserSchema.parse({
  id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl,
})

export const toPublicFeedbackItem = (item: PrivateFeedbackItem): PublicFeedbackItem =>
  PublicFeedbackItemSchema.parse({
    id: item.id, title: item.title, description: item.description, author: toPublicUser(item.author),
    status: item.status, category: item.category, tags: item.tags, voteCount: item.voteCount,
    hasViewerVoted: item.hasViewerVoted, commentCount: item.commentCount,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
  })

export const toPublicComment = (comment: PrivateComment): PublicComment => PublicCommentSchema.parse({
  id: comment.id, feedbackItemId: comment.feedbackItemId, body: comment.body,
  author: toPublicUser(comment.author), createdAt: comment.createdAt, updatedAt: comment.updatedAt,
})

export const toPublicConnectorError = (error: PrivateConnectorError): PublicConnectorError =>
  PublicConnectorErrorSchema.parse({
    code: error.code, message: error.message, retryable: error.retryable,
    retryAfterSeconds: error.retryAfterSeconds,
  })
