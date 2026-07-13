import { describe, expect, it } from 'vitest'
import {
  changelogListResponse,
  commentListResponse,
  roadmapListResponse,
} from './public-content.server.js'
import { PublicFeedbackItemSchema } from '@feedbax/core'

describe('canonical public content APIs', () => {
  it('returns canonical empty comment pages when interaction storage is absent', async () => {
    const response = await commentListResponse(new Request('https://board.test/api/comment?feedbackItemId=feedback-1'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], hasMore: false })
  })

  it('rejects invalid comment and pagination queries', async () => {
    expect((await commentListResponse(new Request('https://board.test/api/comment'))).status).toBe(400)
    expect((await roadmapListResponse(new Request('https://board.test/api/roadmap?limit=101'))).status).toBe(400)
  })

  it('returns configured empty roadmap columns when sources are absent', async () => {
    const [roadmap, changelog] = await Promise.all([
      roadmapListResponse(new Request('https://board.test/api/roadmap')),
      changelogListResponse(new Request('https://board.test/api/changelog')),
    ])
    expect(await roadmap.json()).toMatchObject({
      columns: [
        { status: { id: 'open' }, items: [] },
        { status: { id: 'planned' }, items: [] },
        { status: { id: 'in-progress' }, items: [] },
        { status: { id: 'complete' }, items: [] },
      ],
      hasMore: false,
    })
    expect(await changelog.json()).toEqual({ items: [], hasMore: false })
  })

  it('groups one bounded feedback page and preserves empty selected columns', async () => {
    const item = PublicFeedbackItemSchema.parse({
      id: 'feedback-1', title: 'Offline mode', description: 'Work anywhere', type: 'feature',
      author: { id: 'author', displayName: 'Ada' },
      status: { id: 'planned', name: 'Planned', order: 1, isTerminal: false, color: '#8b5cf6' },
      category: null, tags: [], voteCount: 8, commentCount: 2,
      createdAt: '2026-07-11T12:00:00Z', updatedAt: '2026-07-11T12:00:00Z',
    })
    let received: unknown
    const response = await roadmapListResponse(
      new Request('https://board.test/api/roadmap?status=planned&status=complete&limit=12'),
      { listFeedback: async (filter, page) => {
        received = { filter, page }
        return { value: { items: [item], hasMore: true, nextCursor: 'next-page' }, cacheStatus: 'hit' }
      } },
    )
    expect(received).toEqual({ filter: { statusIds: ['planned', 'complete'], sort: 'most-voted' }, page: { pageSize: 12 } })
    expect(await response.json()).toMatchObject({ columns: [
      { status: { id: 'planned' }, items: [{ id: 'feedback-1' }] },
      { status: { id: 'complete' }, items: [] },
    ], hasMore: true, nextCursor: 'next-page' })
    expect(response.headers.get('x-feedbax-cache')).toBe('hit')
  })

  it('rejects unknown or unbounded roadmap filters without echoing them', async () => {
    for (const query of ['status=private-workflow', 'limit=101']) {
      const response = await roadmapListResponse(new Request(`https://board.test/api/roadmap?${query}`), null)
      expect(response.status).toBe(400)
      expect(JSON.stringify(await response.json())).not.toContain('private-workflow')
    }
  })
})
