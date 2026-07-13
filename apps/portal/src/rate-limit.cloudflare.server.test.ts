import { describe, expect, it } from 'vitest'
import {
  CloudflareDurableRateLimitStore,
  FeedbaxRateLimiter,
} from './rate-limit.cloudflare.server.js'

describe('Cloudflare durable rate limiting', () => {
  it('coordinates limits through one durable object', async () => {
    const values = new Map<string, unknown>()
    const limiter = new FeedbaxRateLimiter({
      storage: {
        transaction: async (callback) =>
          callback({
            transaction: async () => {
              throw new Error('nested transaction')
            },
            get: async <T>(key: string) => values.get(key) as T | undefined,
            put: async (key: string, value: unknown) => {
              values.set(key, value)
            },
          }),
        get: async <T>(key: string) => values.get(key) as T | undefined,
        put: async (key: string, value: unknown) => {
          values.set(key, value)
        },
      },
    })
    const store = new CloudflareDurableRateLimitStore({
      idFromName: (name) => name,
      get: () => ({
        fetch: (input, init) => limiter.fetch(new Request(input, init)),
      }),
    })
    expect(await store.consume('actor', 2, 60)).toMatchObject({ allowed: true })
    expect(await store.consume('actor', 2, 60)).toMatchObject({ allowed: true })
    expect(await store.consume('actor', 2, 60)).toMatchObject({
      allowed: false,
    })
  })

  it('rejects malformed durable object requests', async () => {
    const limiter = new FeedbaxRateLimiter({
      storage: {} as never,
    })
    expect(
      (
        await limiter.fetch(
          new Request('https://limiter', { method: 'POST', body: '{}' }),
        )
      ).status,
    ).toBe(400)
  })
})
