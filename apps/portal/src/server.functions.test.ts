import { describe, expect, it } from 'vitest'
import {
  PublicFeedbackItemSchema,
  RoadmapPageSchema,
  ChangelogPageSchema,
  ChangelogEntrySchema,
  type PublicConnectorReader,
} from '@feedbax/core'
import { loadChangelogDetail, loadFeedbackDetail } from './server.functions.js'

const item = PublicFeedbackItemSchema.parse({
  id: 'feedback-1', title: 'Safe detail', description: 'Useful **context**', type: 'feature',
  author: { id: 'public-author', displayName: 'A customer' },
  status: { id: 'complete', name: 'Complete', order: 3, isTerminal: true }, category: null,
  tags: [], voteCount: 2, commentCount: 0,
  createdAt: '2026-07-12T08:00:00Z', updatedAt: '2026-07-12T09:00:00Z',
})

function reader(overrides: Partial<PublicConnectorReader> = {}): PublicConnectorReader {
  const release = ChangelogPageSchema.parse({ items: [{ id: 'change-1', slug: 'shipped', title: 'Shipped', description: 'Shipped', publishedAt: item.createdAt, tags: [], linkedFeedbackItemIds: ['feedback-1'], createdAt: item.createdAt, updatedAt: item.updatedAt }], hasMore: false })
  return {
    getFeedback: async () => item,
    listFeedback: async () => ({ value: { items: [item], hasMore: false }, cacheStatus: 'hit' }),
    listComments: async () => ({ value: { items: [], hasMore: false }, cacheStatus: 'hit' }),
    listRoadmap: async () => ({ value: RoadmapPageSchema.parse({ items: [{ id: 'roadmap-1', title: 'Next', description: 'Next', status: null, linkedFeedbackItemIds: ['feedback-1'], createdAt: item.createdAt, updatedAt: item.updatedAt }], hasMore: false }), cacheStatus: 'hit' }),
    listChangelog: async () => ({ value: release, cacheStatus: 'hit' }),
    listChangelogForFeedback: async () => ({ value: release, cacheStatus: 'hit' }),
    getChangelogEntry: async () => null,
    ...overrides,
  }
}

describe('feedback detail aggregate', () => {
  it('returns only editorial entries linked to the public item', async () => {
    const detail = await loadFeedbackDetail(reader(), 'feedback-1')
    expect(detail?.roadmap.map(({ id }) => id)).toEqual(['roadmap-1'])
    expect(detail?.releases).toEqual([{
      changelogEntryId: 'change-1', slug: 'shipped', title: 'Shipped',
      publishedAt: item.createdAt,
    }])
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

  it('does not expose or query release links before feedback is terminal', async () => {
    let releaseReads = 0
    const planned = PublicFeedbackItemSchema.parse({
      ...item,
      status: { id: 'planned', name: 'Planned', order: 1, isTerminal: false },
    })
    const detail = await loadFeedbackDetail(reader({
      getFeedback: async () => planned,
      listChangelogForFeedback: async () => { releaseReads++; throw new Error('must not run') },
    }), 'feedback-1')
    expect(detail?.releases).toEqual([])
    expect(releaseReads).toBe(0)
  })

  it('preserves release order while serializing only compact references', async () => {
    const releases = ChangelogPageSchema.parse({ items: [
      { id: 'change-2', slug: 'second-release', title: 'Second release', description: 'Private body two', publishedAt: '2026-07-13T08:00:00Z', tags: [], linkedFeedbackItemIds: ['feedback-1', 'internal-id'], createdAt: item.createdAt, updatedAt: item.updatedAt },
      { id: 'change-1', slug: 'first-release', title: 'First release', description: 'Private body one', publishedAt: '2026-07-12T08:00:00Z', tags: [], linkedFeedbackItemIds: ['feedback-1'], createdAt: item.createdAt, updatedAt: item.updatedAt },
    ], hasMore: false })
    const detail = await loadFeedbackDetail(reader({
      listChangelogForFeedback: async () => ({ value: releases, cacheStatus: 'hit' }),
    }), 'feedback-1')
    expect(detail?.releases.map(({ slug }) => slug)).toEqual(['second-release', 'first-release'])
    expect(JSON.stringify(detail?.releases)).not.toContain('Private body')
    expect(JSON.stringify(detail?.releases)).not.toContain('internal-id')
  })
})

describe('changelog detail aggregate', () => {
  const release = ChangelogEntrySchema.parse({
    id: 'release-1', slug: 'new-dashboard', title: 'New dashboard',
    description: 'A faster dashboard.', publishedAt: item.createdAt, tags: [],
    linkedFeedbackItemIds: ['feedback-1', 'private-feedback', 'feedback-1'],
    createdAt: item.createdAt, updatedAt: item.updatedAt,
  })

  it('deduplicates related IDs and omits feedback outside the terminal public boundary', async () => {
    const requested: string[] = []
    const detail = await loadChangelogDetail(reader({
      getChangelogEntry: async () => release,
      getFeedback: async (id) => {
        requested.push(id)
        return id === 'feedback-1' ? item : id === 'private-feedback'
          ? PublicFeedbackItemSchema.parse({ ...item, id, status: { id: 'planned', name: 'Planned', order: 1, isTerminal: false } })
          : null
      },
    }), 'new-dashboard')
    expect(requested).toEqual(['feedback-1', 'private-feedback'])
    expect(detail?.relatedFeedback.map(({ id }) => id)).toEqual(['feedback-1'])
    expect(JSON.stringify(detail)).not.toContain('private-feedback')
  })

  it('does not resolve feedback for missing or unpublished entries', async () => {
    let reads = 0
    const detail = await loadChangelogDetail(reader({
      getChangelogEntry: async () => null,
      getFeedback: async () => { reads++; return item },
    }), 'missing-entry')
    expect(detail).toBeNull()
    expect(reads).toBe(0)
  })
})
