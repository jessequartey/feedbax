import { describe, expect, it } from 'vitest'
import { feedbackListResponse, parseFeedbackRequest } from './public-feedback.server.js'

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
