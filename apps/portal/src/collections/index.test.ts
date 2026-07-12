import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectionTesting, mergeCanonicalPages } from './index.js'

type Item = { id: string; title: string; voted?: boolean }

afterEach(() => {
  collectionTesting.reset()
  vi.unstubAllGlobals()
})

describe('application query collections', () => {
  it('deduplicates canonical IDs when composing cursor pages', () => {
    expect(mergeCanonicalPages<Item>([
      [{ id: 'one', title: 'Old' }],
      [{ id: 'one', title: 'Fresh' }, { id: 'two', title: 'Two' }],
    ])).toEqual([{ id: 'one', title: 'Fresh' }, { id: 'two', title: 'Two' }])
  })

  it('rolls an optimistic update back when persistence fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      items: [{ id: 'one', title: 'One', voted: false }], hasMore: false,
    })))
    const entry = collectionTesting.pageCollection<Item>({
      id: `rollback-${crypto.randomUUID()}`,
      url: '/api/items',
      parse: (value) => value as { items: Item[]; hasMore: boolean },
      notify: () => {},
      onUpdate: async () => { throw new Error('rejected') },
    })
    await entry.collection.stateWhenReady()
    const transaction = entry.collection.update('one', (draft) => { draft.voted = true })
    expect(entry.collection.state.get('one')?.voted).toBe(true)
    await expect(transaction.isPersisted.promise).rejects.toThrow('rejected')
    expect(entry.collection.state.get('one')?.voted).toBe(false)
  })

  it('commits an optimistic update when persistence succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      items: [{ id: 'one', title: 'One', voted: false }], hasMore: false,
    })))
    const persist = vi.fn(async () => {})
    const entry = collectionTesting.pageCollection<Item>({
      id: `commit-${crypto.randomUUID()}`,
      url: '/api/items',
      parse: (value) => value as { items: Item[]; hasMore: boolean },
      notify: () => {},
      onUpdate: persist,
    })
    await entry.collection.stateWhenReady()
    const transaction = entry.collection.update('one', (draft) => { draft.voted = true })
    await transaction.isPersisted.promise
    expect(persist).toHaveBeenCalledOnce()
  })
})
