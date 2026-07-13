import { describe, expect, it } from 'vitest'
import { ChangelogEntrySchema, PublicChangelogDetailSchema } from '@feedbax/core'
import { changelogMetadata } from './routes/changelog_.$slug.js'
import { plainTextFromMarkdown, renderSanitizedMarkdown } from './markdown.js'

const timestamp = '2026-07-12T08:00:00Z'

describe('public changelog presentation', () => {
  it('builds entry-specific social metadata with a cover image', () => {
    const entry = ChangelogEntrySchema.parse({
      id: 'release-1', slug: 'new-dashboard', title: 'New dashboard',
      description: 'A **faster** [dashboard](https://example.com).', publishedAt: timestamp,
      coverImageUrl: 'https://images.example/dashboard.jpg', tags: [],
      linkedFeedbackItemIds: [], createdAt: timestamp, updatedAt: timestamp,
    })
    const metadata = changelogMetadata(PublicChangelogDetailSchema.parse({ entry, relatedFeedback: [] }))
    expect(metadata.links).toContainEqual({ rel: 'canonical', href: 'https://feedback.feedbax.dev/changelog/new-dashboard' })
    expect(metadata.meta).toContainEqual({ property: 'article:published_time', content: timestamp })
    expect(metadata.meta).toContainEqual({ property: 'og:image', content: 'https://images.example/dashboard.jpg' })
    expect(metadata.meta).toContainEqual({ name: 'description', content: 'A faster dashboard.' })
  })

  it('sanitizes release Markdown and derives plain social copy', () => {
    const markdown = '<script>alert(1)</script> **Safe** [link](javascript%3Aalert(1))'
    const html = renderSanitizedMarkdown(markdown)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('href="#"')
    expect(plainTextFromMarkdown('**Safe** [release](https://example.com)')).toBe('Safe release')
    expect(renderSanitizedMarkdown('## Highlights\n\n> Faster for everyone')).toContain('<h2>Highlights</h2><blockquote>')
  })
})
