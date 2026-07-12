import { describe, expect, it } from 'vitest'
import { PublicFeedbackItemSchema } from '@feedbax/core'
import { feedbackListResponse, feedbackSuggestionsResponse, parseFeedbackRequest, parseSuggestionRequest } from './public-feedback.server.js'

describe('public feedback list', () => {
  it('maps public URL filters to domain filters', () => {
    const result = parseFeedbackRequest(new URL('https://feedbax.test/api/feedback?q=export&status=open&status=planned&category=feature&sort=updated&cursor=next&limit=12'))
    expect(result).toEqual({
      filter: { search: 'export', statusIds: ['open', 'planned'], categoryId: 'feature', sort: 'recently-updated' },
      page: { cursor: 'next', pageSize: 12 },
    })
  })

  it.each([
    'sort=oldest',
    'status=private',
    'category=unknown',
    'limit=101',
  ])('rejects invalid public query %s', (query) => {
    expect(() => parseFeedbackRequest(new URL(`https://feedbax.test/api/feedback?${query}`))).toThrow()
  })

  it('returns a strict empty public page without connector credentials', async () => {
    const response = await feedbackListResponse(new Request('https://feedbax.test/api/feedback'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], hasMore: false })
    expect(response.headers.get('x-feedbax-cache')).toBe('bypass')
  })

  it('sanitizes invalid-query errors', async () => {
    const response = await feedbackListResponse(new Request('https://feedbax.test/api/feedback?category=secret'))
    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).not.toContain('secret')
  })
})

describe('feedback suggestions', () => {
  const candidate = PublicFeedbackItemSchema.parse({
    id: 'export', title: 'Export to CSV', description: 'Download feedback', type: 'feature',
    author: { id: 'author', displayName: 'Author' }, status: null, category: null,
    tags: [], voteCount: 4, commentCount: 0,
    createdAt: '2026-07-12T08:00:00Z', updatedAt: '2026-07-12T08:00:00Z',
  })

  it('validates suggestion titles', () => {
    expect(parseSuggestionRequest(new URL('https://feedbax.test/api/feedback/suggestions?title=export'))).toBe('export')
    expect(() => parseSuggestionRequest(new URL('https://feedbax.test/api/feedback/suggestions?title=ab'))).toThrow()
    expect(() => parseSuggestionRequest(new URL(`https://feedbax.test/api/feedback/suggestions?title=${'x'.repeat(201)}`))).toThrow()
  })

  it('uses one bounded connector read and returns schema-valid matches', async () => {
    let received: unknown
    const response = await feedbackSuggestionsResponse(
      new Request('https://feedbax.test/api/feedback/suggestions?title=export%20csv'),
      { listFeedback: async (filter, page) => {
        received = { filter, page }
        return { value: { items: [candidate], hasMore: false }, cacheStatus: 'hit' }
      } },
    )
    expect(received).toEqual({ filter: { sort: 'recently-updated' }, page: { pageSize: 100 } })
    expect(await response.json()).toEqual({ items: [candidate] })
    expect(response.headers.get('cache-control')).toContain('max-age=30')
    expect(response.headers.get('x-feedbax-cache')).toBe('hit')
  })

  it('returns an empty cached response without connector credentials', async () => {
    const response = await feedbackSuggestionsResponse(
      new Request('https://feedbax.test/api/feedback/suggestions?title=export'), null,
    )
    expect(await response.json()).toEqual({ items: [] })
    expect(response.headers.get('x-feedbax-cache')).toBe('bypass')
  })

  it('sanitizes connector failures', async () => {
    const response = await feedbackSuggestionsResponse(
      new Request('https://feedbax.test/api/feedback/suggestions?title=export'),
      { listFeedback: async () => { throw new Error('secret connector detail') } },
    )
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('secret')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
