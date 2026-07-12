import { describe, expect, it, vi } from 'vitest'
import {
  MemoryCacheAdapter,
  cachedRead,
  invalidateAfterMutation,
} from '../src/index.js'

describe('cachedRead', () => {
  it('supports fresh, stale revalidation, expiry, and structured events', async () => {
    const cache = new MemoryCacheAdapter()
    const load = vi.fn(async () => 'one')
    const events: string[] = []
    let now = 0
    const options = {
      key: 'key',
      tags: ['notion:feedback'],
      cache,
      load,
      now: () => now,
      observe: (event: { type: string }) => events.push(event.type),
    }
    expect((await cachedRead(options)).cacheStatus).toBe('miss')
    expect((await cachedRead(options)).cacheStatus).toBe('hit')
    now = 31_000
    const tasks: Promise<void>[] = []
    expect(
      (await cachedRead({ ...options, schedule: (task) => tasks.push(task) }))
        .cacheStatus,
    ).toBe('stale')
    await Promise.all(tasks)
    now = 400_000
    expect((await cachedRead(options)).cacheStatus).toBe('miss')
    expect(load).toHaveBeenCalledTimes(3)
    expect(events).toEqual(
      expect.arrayContaining([
        'miss',
        'hit',
        'stale',
        'refresh-start',
        'refresh-success',
      ]),
    )
  })

  it('deduplicates concurrent misses and invalidates by mutation tags', async () => {
    const cache = new MemoryCacheAdapter()
    let resolve!: (value: number) => void
    const load = vi.fn(
      () =>
        new Promise<number>((done) => {
          resolve = done
        }),
    )
    const first = cachedRead({
      key: 'a',
      tags: ['notion:feedback'],
      cache,
      load,
    })
    const second = cachedRead({
      key: 'a',
      tags: ['notion:feedback'],
      cache,
      load,
    })
    await Promise.resolve()
    resolve(1)
    expect(
      (await Promise.all([first, second])).map((item) => item.value),
    ).toEqual([1, 1])
    expect(load).toHaveBeenCalledOnce()
    await invalidateAfterMutation(cache, 'feedback', 'notion')
    expect(await cache.get('a')).toBeUndefined()
  })

  it('works without a cache and preserves stale data on refresh failure', async () => {
    expect(
      (await cachedRead({ key: 'x', load: async () => 1 })).cacheStatus,
    ).toBe('bypass')
    const cache = new MemoryCacheAdapter()
    await cache.set('x', { value: 1, createdAt: 0, tags: [] })
    const tasks: Promise<void>[] = []
    const events: string[] = []
    const result = await cachedRead({
      key: 'x',
      cache,
      now: () => 31_000,
      load: async () => {
        throw new Error('offline')
      },
      schedule: (task) => tasks.push(task),
      observe: (event) => events.push(event.type),
    })
    await Promise.all(tasks)
    expect(result).toEqual({ value: 1, cacheStatus: 'stale' })
    expect(events).toContain('refresh-failure')
  })
})
