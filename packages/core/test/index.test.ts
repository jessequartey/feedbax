import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ConnectorFeedbackPageSchema,
  CreateCommentInputSchema,
  CursorPageRequestSchema,
  FeedbackFilterSchema,
  PrivateCommentSchema,
  PrivateConnectorErrorSchema,
  PrivateFeedbackItemSchema,
  PrivateVoteSchema,
  PublicFeedbackItemSchema,
  PublicRoadmapPageSchema,
  RoadmapEntrySchema,
  SubmitFeedbackInputSchema,
  TimestampSchema,
  connectorCapabilities,
  toPublicComment,
  toPublicConnectorError,
  toPublicFeedbackItem,
  type ConnectorDescriptor,
  type PublicFeedbackItem,
} from '../src/index.js'

const now = '2026-07-11T12:00:00Z'
const user = {
  id: 'user-1',
  displayName: 'Ada',
  avatarUrl: 'https://example.com/a.png',
  identitySubject: 'host:1',
  email: 'ada@example.com',
}
const status = { id: 'open', name: 'Open', order: 0, isTerminal: false }
const category = { id: 'feature', name: 'Feature', order: 0 }
const tag = { id: 'mobile', name: 'Mobile', order: 0 }
const privateItem = {
  id: 'feedback-1',
  title: 'Offline mode',
  description: 'Please support offline work.',
  type: 'feature',
  author: user,
  status,
  category,
  tags: [tag],
  voteCount: 4,
  hasViewerVoted: true,
  commentCount: 1,
  createdAt: now,
  updatedAt: now,
  connector: { connectorId: 'notion', externalId: 'page-1' },
}

describe('canonical domain schemas', () => {
  it('validates IDs, timestamps, taxonomy, users, feedback, comments, and votes', () => {
    expect(TimestampSchema.parse(now)).toBe(now)
    expect(() => TimestampSchema.parse('yesterday')).toThrow()
    expect(PrivateFeedbackItemSchema.parse(privateItem).category?.name).toBe(
      'Feature',
    )
    expect(PrivateFeedbackItemSchema.parse(privateItem).type).toBe('feature')
    expect(
      PrivateCommentSchema.parse({
        id: 'comment-1',
        feedbackItemId: 'feedback-1',
        body: 'Yes',
        author: user,
        createdAt: now,
        updatedAt: now,
        connector: { connectorId: 'notion', externalId: 'comment-page' },
      }).author.email,
    ).toBe(user.email)
    expect(
      PrivateVoteSchema.parse({
        id: 'vote-1',
        feedbackItemId: 'feedback-1',
        voter: user,
        createdAt: now,
      }).voter.identitySubject,
    ).toBe('host:1')
    expect(() =>
      PrivateFeedbackItemSchema.parse({
        ...privateItem,
        categories: [category],
      }),
    ).toThrow()
    expect(() =>
      PrivateFeedbackItemSchema.parse({ ...privateItem, category: [category] }),
    ).toThrow()
  })

  it('keeps public projections free of private fields', () => {
    const projected = toPublicFeedbackItem(
      PrivateFeedbackItemSchema.parse(privateItem),
    )
    expect(projected.author).toEqual({
      id: 'user-1',
      displayName: 'Ada',
      avatarUrl: 'https://example.com/a.png',
    })
    expect(projected).not.toHaveProperty('connector')
    expect(projected.author).not.toHaveProperty('email')
    expect(projected.author).not.toHaveProperty('identitySubject')
    expect(
      PublicFeedbackItemSchema.safeParse({
        ...projected,
        connector: privateItem.connector,
      }).success,
    ).toBe(false)
  })

  it('projects comments and connector errors safely', () => {
    const comment = PrivateCommentSchema.parse({
      id: 'comment-1',
      feedbackItemId: 'feedback-1',
      body: 'Yes',
      author: user,
      createdAt: now,
      updatedAt: now,
      connector: { connectorId: 'notion', externalId: 'c1' },
    })
    expect(toPublicComment(comment)).not.toHaveProperty('connector')
    const error = PrivateConnectorErrorSchema.parse({
      code: 'unavailable',
      message: 'Temporarily unavailable',
      retryable: true,
      retryAfterSeconds: 30,
      connectorId: 'notion',
      diagnosticMessage: 'upstream 503',
      cause: { secret: true },
    })
    expect(toPublicConnectorError(error)).toEqual({
      code: 'unavailable',
      message: 'Temporarily unavailable',
      retryable: true,
      retryAfterSeconds: 30,
    })
    expect(() =>
      PrivateConnectorErrorSchema.parse({ ...error, code: 'bad-code' }),
    ).toThrow()
  })

  it('validates idempotent comment commands and rejects public email content', () => {
    const input = { clientRequestId: 'd9428888-122b-4df6-9f3b-2c1f2831b455', feedbackItemId: 'feedback-1', body: 'Markdown **is supported**.' }
    expect(CreateCommentInputSchema.parse(input)).toEqual(input)
    expect(CreateCommentInputSchema.safeParse({ ...input, body: 'Email me at ada@example.com' }).success).toBe(false)
    expect(CreateCommentInputSchema.safeParse({ ...input, email: 'ada@example.com' }).success).toBe(false)
  })

  it('rejects server-owned mutation fields and invalid filters', () => {
    expect(
      SubmitFeedbackInputSchema.parse({ title: 'Idea', description: 'Details', type: 'feature' })
        .tagIds,
    ).toEqual([])
    expect(() =>
      SubmitFeedbackInputSchema.parse({
        title: 'Idea',
        description: 'Details',
        type: 'feature',
        voteCount: 99,
      }),
    ).toThrow()
    expect(
      FeedbackFilterSchema.parse({
        statusIds: ['open'],
        categoryId: 'feature',
        tagIds: ['mobile'],
        authorId: 'user-1',
        roadmapEntryId: 'roadmap-1',
      }).sort,
    ).toBe('newest')
    expect(() => FeedbackFilterSchema.parse({ sort: 'random' })).toThrow()
  })

  it('enforces bounded, internally consistent cursor pages', () => {
    expect(CursorPageRequestSchema.parse({})).toEqual({ pageSize: 20 })
    expect(() => CursorPageRequestSchema.parse({ pageSize: 101 })).toThrow()
    expect(
      ConnectorFeedbackPageSchema.parse({
        items: [privateItem],
        hasMore: true,
        nextCursor: 'opaque',
      }).items,
    ).toHaveLength(1)
    expect(() =>
      ConnectorFeedbackPageSchema.parse({ items: [], hasMore: true }),
    ).toThrow()
    expect(() =>
      ConnectorFeedbackPageSchema.parse({
        items: [],
        hasMore: false,
        nextCursor: 'stale',
      }),
    ).toThrow()
  })

  it('supports independent editorial entries linked to many feedback items', () => {
    const entry = RoadmapEntrySchema.parse({
      id: 'roadmap-1',
      title: 'Mobile',
      description: 'Mobile improvements',
      linkedFeedbackItemIds: ['feedback-1', 'feedback-2'],
      status,
      createdAt: now,
      updatedAt: now,
    })
    expect(entry.linkedFeedbackItemIds).toHaveLength(2)
  })

  it('validates grouped public roadmap pages and unique columns', () => {
    const item = PublicFeedbackItemSchema.parse(toPublicFeedbackItem(PrivateFeedbackItemSchema.parse(privateItem)))
    expect(PublicRoadmapPageSchema.parse({ columns: [{ status, items: [item] }], hasMore: false }).columns[0]?.items).toHaveLength(1)
    expect(() => PublicRoadmapPageSchema.parse({ columns: [{ status, items: [] }, { status, items: [] }], hasMore: false })).toThrow()
    expect(() => PublicRoadmapPageSchema.parse({ columns: [], hasMore: true })).toThrow()
  })

  it('retains framework-independent connector contracts', () => {
    const descriptor = {
      id: 'notion',
      displayName: 'Notion',
      capabilities: ['comments'],
    } as const satisfies ConnectorDescriptor
    expect(connectorCapabilities).toContain('comments')
    expectTypeOf<PublicFeedbackItem>().toBeObject()
    expect(descriptor.id).toBe('notion')
  })
})
