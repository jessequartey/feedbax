import { describe, expect, it } from 'vitest'
import type { PublicFeedbackItem } from '@feedbax/core'
import { reconcileFeedback } from './feedback-board.js'

const item = (id: string, updatedAt: string, title = id): PublicFeedbackItem => ({
  id: id as PublicFeedbackItem['id'], title, description: 'Description',
  author: { id: 'public' as PublicFeedbackItem['author']['id'], displayName: 'Public user' },
  status: null, category: null, tags: [], voteCount: 0, commentCount: 0,
  createdAt: '2026-07-01T00:00:00Z', updatedAt,
})

describe('feedback collection reconciliation', () => {
  it('deduplicates pages and keeps the newest server record', () => {
    const result = reconcileFeedback(
      [item('one', '2026-07-10T00:00:00Z', 'Current')],
      [item('one', '2026-07-09T00:00:00Z', 'Stale'), item('two', '2026-07-11T00:00:00Z')],
    )
    expect(result.map(({ title }) => title)).toEqual(['Current', 'two'])
  })

  it('replaces an older record with a newer update', () => {
    expect(reconcileFeedback(
      [item('one', '2026-07-09T00:00:00Z', 'Old')],
      [item('one', '2026-07-10T00:00:00Z', 'New')],
    )[0]?.title).toBe('New')
  })
})
