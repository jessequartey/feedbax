import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/index.js'
describe('defineConfig', () => {
  it('preserves typed input', () => {
    const value = defineConfig({
      name: 'Feedbax',
      connector: { id: 'test', displayName: 'Test', capabilities: [] },
    })
    expect(value.name).toBe('Feedbax')
  })
  it('validates mutation protection at runtime', () => {
    const base = {
      name: 'Feedbax',
      connector: { id: 'test', displayName: 'Test', capabilities: [] },
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
    ).toThrow()
  })
  it('validates ordered roadmap status references', () => {
    const base = {
      name: 'Feedbax',
      connector: { id: 'test', displayName: 'Test', capabilities: [] },
      publicTaxonomy: { statuses: [
        { id: 'planned', name: 'Planned', order: 0 },
        { id: 'done', name: 'Done', order: 1 },
      ], categories: [] },
      roadmap: { title: 'Roadmap', columnStatusIds: ['planned', 'done'] },
    } as const
    expect(defineConfig(base).roadmap?.columnStatusIds).toEqual(['planned', 'done'])
    expect(() => defineConfig({ ...base, roadmap: { ...base.roadmap, columnStatusIds: ['planned', 'private'] } })).toThrow(/public status/)
    expect(() => defineConfig({ ...base, roadmap: { ...base.roadmap, columnStatusIds: ['planned', 'planned'] } })).toThrow(/unique/)
  })
  it('requires a visible changelog title', () => {
    const base = {
      name: 'Feedbax',
      connector: { id: 'test', displayName: 'Test', capabilities: [] },
    } as const
    expect(defineConfig({ ...base, changelog: { title: 'Product updates' } }).changelog?.title).toBe('Product updates')
    expect(() => defineConfig({ ...base, changelog: { title: '   ' } })).toThrow(/Changelog title/)
  })
})
