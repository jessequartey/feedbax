import { describe, expect, it } from 'vitest'
import {
  PublicFeedbackItemSchema,
  type PublicFeedbackItem,
} from '@feedbax/core'
import {
  normalizeSuggestionTitle,
  rankDuplicateSuggestions,
  suggestionScore,
} from './duplicate-suggestions.js'

const item = (id: string, title: string, voteCount = 0): PublicFeedbackItem =>
  PublicFeedbackItemSchema.parse({
    id,
    title,
    description: `${title} description`,
    type: 'feature',
    author: { id: 'author', displayName: 'Author' },
    status: null,
    category: null,
    tags: [],
    voteCount,
    commentCount: 0,
    createdAt: '2026-07-12T08:00:00Z',
    updatedAt: '2026-07-12T08:00:00Z',
  })

describe('duplicate suggestion matching', () => {
  it('normalizes case, accents, punctuation, and whitespace', () => {
    expect(normalizeSuggestionTitle('  Éxport—TO   CSV! ')).toBe(
      'export to csv',
    )
  })

  it('matches exact, reordered, and mildly mistyped titles', () => {
    expect(suggestionScore('Export CSV', 'export csv')).toBe(1)
    expect(suggestionScore('CSV export', 'Export CSV')).toBeGreaterThan(0.75)
    expect(suggestionScore('Export to CSF', 'Export to CSV')).toBeGreaterThan(
      0.8,
    )
  })

  it('excludes unrelated titles', () => {
    expect(
      rankDuplicateSuggestions('Export to CSV', [item('one', 'Dark mode')]),
    ).toEqual([])
  })

  it('orders by score, breaks ties by votes, and returns at most three', () => {
    const ranked = rankDuplicateSuggestions('Export CSV', [
      item('low-votes', 'CSV export', 2),
      item('exact-low', 'Export CSV', 1),
      item('exact-high', 'Export CSV', 20),
      item('fourth', 'Export CSV files', 100),
    ])
    expect(ranked.map(({ id }) => id)).toEqual([
      'exact-high',
      'exact-low',
      'fourth',
    ])
  })
})
