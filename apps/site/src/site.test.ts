import { describe, expect, it } from 'vitest'
import {
  docsNavigation,
  matchesSearch,
  searchIndex,
  statusLabels,
} from './lib/site'
import { homepageClaims } from './routes/index'

describe('site content model', () => {
  it('publishes every required documentation page in a stable order', () => {
    expect(docsNavigation.map((item) => item.slug)).toEqual([
      '',
      'product-vision',
      'quickstart',
      'configuration',
      'authentication-handoff',
      'notion-setup',
      'deployment',
      'accessibility',
      'roadmap',
      'contributing',
    ])
  })

  it('uses only the agreed public status labels', () => {
    expect(statusLabels).toEqual([
      'Available',
      'Preview available',
      'Release prerequisite',
      'Deferred',
    ])
  })

  it('builds a static search record for every documentation page', () => {
    expect(searchIndex).toHaveLength(docsNavigation.length)
    expect(
      searchIndex.find((item) =>
        matchesSearch(item.keywords, 'identity handoff'),
      )?.href,
    ).toBe('/docs/authentication-handoff')
    expect(searchIndex.every((item) => item.href.startsWith('/docs'))).toBe(
      true,
    )
  })

  it('keeps homepage claims honest about pre-release status', () => {
    expect(homepageClaims.promise).toContain('Notion database')
    expect(homepageClaims.status).toContain('pre-release')
    expect(homepageClaims.status).toContain('external launch prerequisites')
  })
})
