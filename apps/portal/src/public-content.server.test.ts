import { describe, expect, it } from 'vitest'
import {
  changelogListResponse,
  commentListResponse,
  roadmapListResponse,
} from './public-content.server.js'

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

  it('returns canonical empty editorial pages when sources are absent', async () => {
    const [roadmap, changelog] = await Promise.all([
      roadmapListResponse(new Request('https://board.test/api/roadmap')),
      changelogListResponse(new Request('https://board.test/api/changelog')),
    ])
    expect(await roadmap.json()).toEqual({ items: [], hasMore: false })
    expect(await changelog.json()).toEqual({ items: [], hasMore: false })
  })
})
