import { describe, expect, it } from 'vitest'
import { defineConfig, readableAccentForeground } from '../src/index.js'

const branding = {
  productName: 'Feedbax',
  description: 'Shape what we build next.',
  logo: '/brand/logo.svg',
  favicon: '/favicon.svg',
  accentColor: '#2563eb',
  themes: {
    light: {
      background: '#f6f7fb',
      surface: '#ffffff',
      text: '#25273d',
      mutedText: '#626a80',
      border: '#d4d7e1',
    },
    dark: {
      background: '#0d111b',
      surface: '#141a26',
      text: '#e8edf7',
      mutedText: '#aeb8ca',
      border: '#3b465c',
    },
  },
  navigation: [{ label: 'Feedback', href: '/' }],
  poweredByFeedbax: true,
} as const

const connector = {
  id: 'test',
  displayName: 'Test',
  capabilities: [],
} as const

describe('defineConfig', () => {
  it('parses and normalizes branding', () => {
    const value = defineConfig({ branding, connector })
    expect(value.branding.productName).toBe('Feedbax')
    expect(value.subscriptions).toEqual({ enabled: false })
    expect(value.commentRoles).toEqual({ administrator: [], team: [] })
  })

  it('validates brand colors, assets, contrast, and navigation', () => {
    expect(() =>
      defineConfig({
        branding: { ...branding, accentColor: 'blue' },
        connector,
      }),
    ).toThrow(/six-digit hex/)
    expect(() =>
      defineConfig({
        branding: { ...branding, favicon: '/favicon.exe' },
        connector,
      }),
    ).toThrow(/Unsupported favicon/)
    expect(() =>
      defineConfig({
        branding: {
          ...branding,
          navigation: [
            { label: 'Feedback', href: '/' },
            { label: 'Again', href: '/' },
          ],
        },
        connector,
      }),
    ).toThrow(/unique/)
    expect(() =>
      defineConfig({
        branding: {
          ...branding,
          themes: {
            ...branding.themes,
            light: { ...branding.themes.light, text: '#eeeeee' },
          },
        },
        connector,
      }),
    ).toThrow(/4.5:1/)
    expect(readableAccentForeground('#2563eb')).toBe('#ffffff')
    expect(() =>
      defineConfig({
        branding: { ...branding, logo: '/\\evil.example/logo.svg' },
        connector,
      }),
    ).toThrow(/safe root-relative/)
  })

  it('validates signed handoff and Notion setup structures', () => {
    expect(() =>
      defineConfig({
        branding,
        connector: { ...connector, setup: { dataSourceId: 'only-an-id' } },
      }),
    ).toThrow()
    expect(() =>
      defineConfig({
        branding,
        connector,
        authentication: {
          audience: 'feedbax',
          issuers: [],
          sessionKeys: [],
          activeSessionKeyId: 'active',
          loginUrl: 'https://app.example.com/login',
        },
      }),
    ).toThrow()
  })

  it('validates mutation protection at runtime', () => {
    const base = {
      branding,
      connector,
      mutationProtection: {
        allowedOrigins: ['https://board.example'],
        request: { limit: 100, windowSeconds: 60 },
        actions: {
          submit: { limit: 5, windowSeconds: 300 },
          vote: { limit: 60, windowSeconds: 60 },
          comment: { limit: 20, windowSeconds: 300 },
          subscribe: { limit: 20, windowSeconds: 300 },
        },
      },
    } as const
    expect(defineConfig(base).mutationProtection?.request.limit).toBe(100)
    expect(() =>
      defineConfig({
        ...base,
        mutationProtection: {
          ...base.mutationProtection,
          allowedOrigins: ['https://board.example/path'],
        },
      }),
    ).toThrow(/origin/)
  })

  it('validates ordered roadmap status references', () => {
    const base = {
      branding,
      connector,
      publicTaxonomy: {
        statuses: [
          { id: 'planned', name: 'Planned', order: 0 },
          { id: 'done', name: 'Done', order: 1 },
        ],
        categories: [],
      },
      roadmap: { title: 'Roadmap', columnStatusIds: ['planned', 'done'] },
    } as const
    expect(defineConfig(base).roadmap?.columnStatusIds).toEqual([
      'planned',
      'done',
    ])
    expect(() =>
      defineConfig({
        ...base,
        roadmap: { ...base.roadmap, columnStatusIds: ['planned', 'private'] },
      }),
    ).toThrow(/public status/)
    expect(() =>
      defineConfig({
        ...base,
        roadmap: { ...base.roadmap, columnStatusIds: ['planned', 'planned'] },
      }),
    ).toThrow(/unique/)
  })

  it('requires a visible changelog title', () => {
    expect(
      defineConfig({
        branding,
        connector,
        changelog: { title: 'Product updates' },
      }).changelog?.title,
    ).toBe('Product updates')
    expect(() =>
      defineConfig({
        branding,
        connector,
        changelog: { title: '   ' },
      }),
    ).toThrow(/Too small/)
  })
})
