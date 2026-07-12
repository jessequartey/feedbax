export type CacheTag = string
export type CacheStatus = 'hit' | 'stale' | 'miss' | 'bypass'

export interface CacheEntry<T = unknown> {
  readonly value: T
  readonly createdAt: number
  readonly tags: readonly CacheTag[]
}

export interface CacheAdapter {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>
  invalidateTags(tags: readonly CacheTag[]): Promise<void>
}

export type CacheEvent = Readonly<{
  type:
    | 'hit'
    | 'stale'
    | 'miss'
    | 'bypass'
    | 'refresh-start'
    | 'refresh-success'
    | 'refresh-failure'
    | 'invalidate'
  key?: string
  tags?: readonly CacheTag[]
  error?: unknown
}>

export type CacheObserver = (event: CacheEvent) => void
export type CacheScheduler = (task: Promise<void>) => void

export interface CachedReadOptions<T> {
  readonly key: string
  readonly tags?: readonly CacheTag[]
  readonly load: () => Promise<T>
  readonly cache?: CacheAdapter
  readonly freshMs?: number
  readonly staleMs?: number
  readonly now?: () => number
  readonly schedule?: CacheScheduler
  readonly observe?: CacheObserver
  readonly bypass?: boolean
}

export interface CachedReadResult<T> {
  readonly value: T
  readonly cacheStatus: CacheStatus
}

const inflight = new Map<string, Promise<unknown>>()
const defaultSchedule: CacheScheduler = (task) =>
  void task.catch(() => undefined)

async function loadOnce<T>(
  options: CachedReadOptions<T>,
  cache: CacheAdapter,
): Promise<T> {
  const existing = inflight.get(options.key) as Promise<T> | undefined
  if (existing) return existing
  const promise = options
    .load()
    .then(async (value) => {
      await cache.set(options.key, {
        value,
        createdAt: (options.now ?? Date.now)(),
        tags: options.tags ?? [],
      })
      return value
    })
    .finally(() => inflight.delete(options.key))
  inflight.set(options.key, promise)
  return promise
}

export async function cachedRead<T>(
  options: CachedReadOptions<T>,
): Promise<CachedReadResult<T>> {
  const observe = options.observe ?? (() => undefined)
  if (options.bypass || !options.cache) {
    observe({ type: 'bypass', key: options.key })
    return { value: await options.load(), cacheStatus: 'bypass' }
  }
  const cache = options.cache
  const entry = await cache.get<T>(options.key)
  const age = entry
    ? (options.now ?? Date.now)() - entry.createdAt
    : Number.POSITIVE_INFINITY
  const freshMs = options.freshMs ?? 30_000
  const staleMs = options.staleMs ?? 300_000
  if (entry && age <= freshMs) {
    observe({ type: 'hit', key: options.key })
    return { value: entry.value, cacheStatus: 'hit' }
  }
  if (entry && age <= freshMs + staleMs) {
    observe({ type: 'stale', key: options.key })
    observe({ type: 'refresh-start', key: options.key })
    const refresh = loadOnce(options, cache).then(
      () => observe({ type: 'refresh-success', key: options.key }),
      (error) => observe({ type: 'refresh-failure', key: options.key, error }),
    )
    ;(options.schedule ?? defaultSchedule)(refresh)
    return { value: entry.value, cacheStatus: 'stale' }
  }
  observe({ type: 'miss', key: options.key })
  return { value: await loadOnce(options, cache), cacheStatus: 'miss' }
}

export class MemoryCacheAdapter implements CacheAdapter {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly tagKeys = new Map<CacheTag, Set<string>>()

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    return this.entries.get(key) as CacheEntry<T> | undefined
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const previous = this.entries.get(key)
    for (const tag of previous?.tags ?? []) this.tagKeys.get(tag)?.delete(key)
    this.entries.set(key, entry)
    for (const tag of entry.tags) {
      const keys = this.tagKeys.get(tag) ?? new Set<string>()
      keys.add(key)
      this.tagKeys.set(tag, keys)
    }
  }

  async invalidateTags(tags: readonly CacheTag[]): Promise<void> {
    const keys = new Set(
      tags.flatMap((tag) => [...(this.tagKeys.get(tag) ?? [])]),
    )
    for (const key of keys) {
      const entry = this.entries.get(key)
      this.entries.delete(key)
      for (const tag of entry?.tags ?? []) this.tagKeys.get(tag)?.delete(key)
    }
  }
}

export const cacheTags = {
  feedback: (connectorId: string) => `${connectorId}:feedback`,
  feedbackItem: (connectorId: string, itemId: string) =>
    `${connectorId}:feedback:${itemId}`,
  roadmap: (connectorId: string) => `${connectorId}:roadmap`,
  changelog: (connectorId: string) => `${connectorId}:changelog`,
} as const

export async function invalidateAfterMutation(
  cache: CacheAdapter,
  mutation: 'feedback' | 'comment' | 'vote' | 'roadmap' | 'changelog',
  connectorId: string,
  itemId?: string,
  observe: CacheObserver = () => undefined,
): Promise<void> {
  const tags =
    mutation === 'feedback'
      ? [cacheTags.feedback(connectorId), cacheTags.roadmap(connectorId)]
      : mutation === 'comment' || mutation === 'vote'
        ? [
            cacheTags.feedback(connectorId),
            ...(itemId ? [cacheTags.feedbackItem(connectorId, itemId)] : []),
          ]
        : [
            mutation === 'roadmap'
              ? cacheTags.roadmap(connectorId)
              : cacheTags.changelog(connectorId),
          ]
  await cache.invalidateTags(tags)
  observe({ type: 'invalidate', tags })
}
