import { describe, expect, it } from 'vitest'
import {
  changelogListResponse,
  commentListResponse,
  roadmapListResponse,
} from './public-content.server.js'
import { ChangelogEntrySchema, PublicFeedbackItemSchema } from '@feedbax/core'

describe('canonical public content APIs', () => {
  it('distinguishes unavailable comment storage from an empty thread', async () => {
    const response = await commentListResponse(
      new Request('https://board.test/api/comment?feedbackItemId=feedback-1'),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: 'CONNECTOR_UNAVAILABLE' },
    })
  })

  it('rejects invalid comment and pagination queries', async () => {
    expect(
      (await commentListResponse(new Request('https://board.test/api/comment')))
        .status,
    ).toBe(400)
    expect(
      (
        await roadmapListResponse(
          new Request('https://board.test/api/roadmap?limit=101'),
        )
      ).status,
    ).toBe(400)
  })

  it('reports roadmap and changelog sources as unavailable when absent', async () => {
    const [roadmap, changelog] = await Promise.all([
      roadmapListResponse(new Request('https://board.test/api/roadmap')),
      changelogListResponse(new Request('https://board.test/api/changelog')),
    ])
    expect(roadmap.status).toBe(503)
    expect(changelog.status).toBe(503)
    expect(await roadmap.json()).toMatchObject({
      error: { code: 'CONNECTOR_UNAVAILABLE' },
    })
    expect(await changelog.json()).toMatchObject({
      error: { code: 'CONNECTOR_UNAVAILABLE' },
    })
  })

  it('groups one bounded feedback page and preserves empty selected columns', async () => {
    const item = PublicFeedbackItemSchema.parse({
      id: 'feedback-1',
      title: 'Offline mode',
      description: 'Work anywhere',
      type: 'feature',
      author: { id: 'author', displayName: 'Ada' },
      status: {
        id: 'planned',
        name: 'Planned',
        order: 1,
        isTerminal: false,
        color: '#8b5cf6',
      },
      category: null,
      tags: [],
      voteCount: 8,
      commentCount: 2,
      createdAt: '2026-07-11T12:00:00Z',
      updatedAt: '2026-07-11T12:00:00Z',
    })
    let received: unknown
    const response = await roadmapListResponse(
      new Request(
        'https://board.test/api/roadmap?status=planned&status=complete&limit=12',
      ),
      {
        listFeedback: async (filter, page) => {
          received = { filter, page }
          return {
            value: { items: [item], hasMore: true, nextCursor: 'next-page' },
            cacheStatus: 'hit',
          }
        },
      },
    )
    expect(received).toEqual({
      filter: { statusIds: ['planned', 'complete'], sort: 'most-voted' },
      page: { pageSize: 12 },
    })
    expect(await response.json()).toMatchObject({
      columns: [
        { status: { id: 'planned' }, items: [{ id: 'feedback-1' }] },
        { status: { id: 'complete' }, items: [] },
      ],
      hasMore: true,
      nextCursor: 'next-page',
    })
    expect(response.headers.get('x-feedbax-cache')).toBe('hit')
  })

  it('rejects unknown or unbounded roadmap filters without echoing them', async () => {
    for (const query of ['status=private-workflow', 'limit=101']) {
      const response = await roadmapListResponse(
        new Request(`https://board.test/api/roadmap?${query}`),
        null,
      )
      expect(response.status).toBe(400)
      expect(JSON.stringify(await response.json())).not.toContain(
        'private-workflow',
      )
    }
  })

  it('returns a strict paginated changelog response with cache state', async () => {
    const release = ChangelogEntrySchema.parse({
      id: 'release-1',
      slug: 'new-dashboard',
      title: 'New dashboard',
      description: 'Shipped.',
      publishedAt: '2026-07-12T08:00:00Z',
      tags: [],
      linkedFeedbackItemIds: [],
      createdAt: '2026-07-11T08:00:00Z',
      updatedAt: '2026-07-12T08:00:00Z',
    })
    let page: unknown
    const response = await changelogListResponse(
      new Request('https://board.test/api/changelog?cursor=opaque&limit=12'),
      {
        listChangelog: async (value) => {
          page = value
          return {
            value: { items: [release], hasMore: true, nextCursor: 'next' },
            cacheStatus: 'miss',
          }
        },
      },
    )
    expect(page).toEqual({ cursor: 'opaque', pageSize: 12 })
    expect(await response.json()).toMatchObject({
      items: [{ slug: 'new-dashboard', linkedFeedbackItemIds: [] }],
      hasMore: true,
      nextCursor: 'next',
    })
    expect(response.headers.get('x-feedbax-cache')).toBe('miss')
  })

  it('separates invalid changelog queries from sanitized connector failures', async () => {
    expect(
      (
        await changelogListResponse(
          new Request('https://board.test/api/changelog?limit=101'),
          null,
        )
      ).status,
    ).toBe(400)
    const response = await changelogListResponse(
      new Request('https://board.test/api/changelog'),
      {
        listChangelog: async () => {
          throw new Error('secret workspace response')
        },
      },
    )
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain(
      'secret workspace response',
    )
  })
})
