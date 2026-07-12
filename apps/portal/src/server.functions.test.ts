import { describe, expect, it } from 'vitest'
import {
  PublicFeedbackItemSchema,
  RoadmapPageSchema,
  ChangelogPageSchema,
  type PublicConnectorReader,
} from '@feedbax/core'
import { loadFeedbackDetail } from './server.functions.js'

const item = PublicFeedbackItemSchema.parse({
  id: 'feedback-1', title: 'Safe detail', description: 'Useful **context**', type: 'feature',
  author: { id: 'public-author', displayName: 'A customer' }, status: null, category: null,
  tags: [], voteCount: 2, commentCount: 0,
  createdAt: '2026-07-12T08:00:00Z', updatedAt: '2026-07-12T09:00:00Z',
})

function reader(overrides: Partial<PublicConnectorReader> = {}): PublicConnectorReader {
  return {
    getFeedback: async () => item,
    listFeedback: async () => ({ value: { items: [item], hasMore: false }, cacheStatus: 'hit' }),
    listComments: async () => ({ value: { items: [], hasMore: false }, cacheStatus: 'hit' }),
    listRoadmap: async () => ({ value: RoadmapPageSchema.parse({ items: [{ id: 'roadmap-1', title: 'Next', description: 'Next', status: null, linkedFeedbackItemIds: ['feedback-1'], createdAt: item.createdAt, updatedAt: item.updatedAt }], hasMore: false }), cacheStatus: 'hit' }),
    listChangelog: async () => ({ value: ChangelogPageSchema.parse({ items: [{ id: 'change-1', title: 'Shipped', description: 'Shipped', linkedFeedbackItemIds: ['another-item'], createdAt: item.createdAt, updatedAt: item.updatedAt }], hasMore: false }), cacheStatus: 'hit' }),
    ...overrides,
  }
}

describe('feedback detail aggregate', () => {
  it('returns only editorial entries linked to the public item', async () => {
    const detail = await loadFeedbackDetail(reader(), 'feedback-1')
    expect(detail?.roadmap.map(({ id }) => id)).toEqual(['roadmap-1'])
    expect(detail?.changelog).toEqual([])
    expect(detail?.subscription).toEqual({ enabled: false })
  })

  it('does not perform secondary reads for missing or private items', async () => {
    let secondaryReads = 0
    const detail = await loadFeedbackDetail(reader({
      getFeedback: async () => null,
      listComments: async () => { secondaryReads++; throw new Error('must not run') },
    }), 'private-item')
    expect(detail).toBeNull()
    expect(secondaryReads).toBe(0)
  })
})
