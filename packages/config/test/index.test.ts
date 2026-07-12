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
})
