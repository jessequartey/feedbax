import { createCollection, type Collection } from '@tanstack/db'
import { QueryClient } from '@tanstack/query-core'
import {
  queryCollectionOptions,
  type QueryCollectionUtils,
} from '@tanstack/query-db-collection'
import {
  ChangelogEntrySchema,
  ChangelogPageSchema,
  FeedbackSuggestionsSchema,
  PublicCommentPageSchema,
  PublicCommentSchema,
  PublicFeedbackItemSchema,
  PublicFeedbackPageSchema,
  PublicRoadmapPageSchema,
  SetVoteResultSchema,
  VoteStateResponseSchema,
  RoadmapPageSchema,
  type ChangelogEntry,
  type CreateCommentInput,
  type PublicComment,
  type PublicFeedbackItem,
  type SubmitFeedbackInput,
} from '@feedbax/core'
import { useMemo, useSyncExternalStore } from 'react'
import { publicTaxonomy } from '../portal.config.js'

export const collectionQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export interface FeedbackCollectionFilters {
  readonly q: string
  readonly statuses: readonly string[]
  readonly category: string
  readonly sort: 'popular' | 'recent' | 'updated'
}

type Page<T extends object> = {
  readonly items: readonly T[]
  readonly nextCursor?: string | undefined
  readonly hasMore: boolean
}

type PageCollection<T extends object> = Collection<
  T,
  string | number,
  QueryCollectionUtils<T, string | number, T, unknown>,
  never,
  T
>
type PageEntry<T extends { id: string }> = {
  collection: PageCollection<T>
  meta: { nextCursor?: string | undefined; hasMore: boolean }
  ready: boolean
  refreshing: boolean
  error: Error | undefined
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const value = await response.json()
  if (!response.ok) {
    const details = (
      value as {
        error?: {
          code?: string
          message?: string
          requestId?: string
          retryable?: boolean
          retryAfterSeconds?: number
          loginLocation?: string
        }
      }
    ).error
    throw new ApplicationApiError(
      details?.message ?? 'The request could not be completed.',
      response.status,
      details?.code ?? 'UNEXPECTED_ERROR',
      details?.requestId,
      details?.retryable ?? response.status >= 500,
      details?.retryAfterSeconds,
      details?.loginLocation,
    )
  }
  return value as T
}

export class ApplicationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
    readonly loginLocation?: string,
  ) {
    super(message)
  }
}

const createdItems = new Map<string, PublicFeedbackItem>()
const canonicalVotes = new Map<
  string,
  ReturnType<typeof SetVoteResultSchema.parse>
>()

async function enrichVoteState(items: readonly PublicFeedbackItem[]) {
  if (!items.length) return items
  try {
    const state = VoteStateResponseSchema.parse(
      await api<unknown>('/api/vote-state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feedbackItemIds: items.map(({ id }) => id) }),
      }),
    )
    const byId = new Map(
      state.items.map((entry) => [entry.feedbackItemId, entry.voted]),
    )
    return items.map((item) => ({
      ...item,
      hasViewerVoted: byId.get(item.id) ?? false,
    }))
  } catch {
    return items
  }
}

async function persistVoteUpdates(items: readonly PublicFeedbackItem[]) {
  for (const item of items)
    canonicalVotes.set(
      item.id,
      SetVoteResultSchema.parse(
        await post<unknown>('/api/vote', {
          feedbackItemId: item.id,
          voted: item.hasViewerVoted ?? false,
        }),
      ),
    )
}

function post<T>(path: string, input: unknown) {
  return api<{ ok: true; value: T }>(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-feedbax-return-path': `${location.pathname}${location.search}`,
    },
    body: JSON.stringify({ input }),
  }).then(({ value }) => value)
}

function pageCollection<T extends { id: string }>(options: {
  id: string
  url: string
  parse: (value: unknown) => Page<T>
  onInsert?: (items: readonly T[]) => Promise<void>
  onUpdate?: (items: readonly T[]) => Promise<void>
  notify: () => void
  enrich?: (items: readonly T[]) => Promise<readonly T[]>
}): PageEntry<T> {
  const entry = {
    meta: { hasMore: false },
    ready: false,
    refreshing: false,
    error: undefined,
  } as PageEntry<T>
  const collection = createCollection(
    queryCollectionOptions<T>({
      id: options.id,
      queryKey: ['feedbax', options.id],
      queryClient: collectionQueryClient,
      getKey: (item) => item.id,
      queryFn: async () => {
        entry.refreshing = entry.ready
        options.notify()
        try {
          const page = options.parse(await api<unknown>(options.url))
          const items = options.enrich
            ? await options.enrich(page.items)
            : page.items
          entry.meta = {
            hasMore: page.hasMore,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          }
          entry.error = undefined
          entry.ready = true
          options.notify()
          return [...items]
        } catch (error) {
          entry.error =
            error instanceof Error
              ? error
              : new Error('Collection query failed.')
          options.notify()
          throw error
        } finally {
          entry.refreshing = false
          options.notify()
        }
      },
      ...(options.onInsert
        ? {
            onInsert: async ({ transaction }) => {
              await options.onInsert!(
                transaction.mutations.map(({ modified }) => modified),
              )
            },
          }
        : {}),
      ...(options.onUpdate
        ? {
            onUpdate: async ({ transaction }) => {
              await options.onUpdate!(
                transaction.mutations.map(({ modified }) => modified),
              )
            },
          }
        : {}),
    }),
  ) as unknown as PageCollection<T>
  entry.collection = collection
  return entry
}

type Snapshot<T> = {
  items: readonly T[]
  isLoading: boolean
  isLoadingMore: boolean
  isRefreshing: boolean
  hasMore: boolean
  error?: Error
}

class PagedController<T extends { id: string }> {
  private readonly pages: PageEntry<T>[] = []
  private readonly listeners = new Set<() => void>()
  private subscriptions: Array<{ unsubscribe(): void }> = []
  private snapshotValue: Snapshot<T> = {
    items: [],
    isLoading: true,
    isLoadingMore: false,
    hasMore: false,
    isRefreshing: false,
  }

  constructor(
    private readonly createPage: (
      cursor: string | undefined,
      notify: () => void,
    ) => PageEntry<T>,
  ) {
    this.addPage(undefined)
  }

  private notify = () => {
    const items = mergeCanonicalPages(
      this.pages.map(({ collection }) => collection.toArray),
    )
    const last = this.pages.at(-1)
    const error = this.pages.find((page) => page.error)?.error
    this.snapshotValue = {
      items,
      isLoading: this.pages.length === 1 && !this.pages[0]!.ready && !error,
      isLoadingMore: this.pages.length > 1 && !last!.ready && !last!.error,
      isRefreshing: this.pages.some((page) => page.ready && page.refreshing),
      hasMore: last?.meta.hasMore ?? false,
      ...(error ? { error } : {}),
    }
    for (const listener of this.listeners) listener()
  }

  private addPage(cursor: string | undefined) {
    const page = this.createPage(cursor, this.notify)
    this.pages.push(page)
    this.subscriptions.push(page.collection.subscribeChanges(this.notify))
    void page.collection.stateWhenReady().then(this.notify, this.notify)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  snapshot = () => this.snapshotValue
  loadMore = () => {
    const cursor = this.pages.at(-1)?.meta.nextCursor
    if (cursor) this.addPage(cursor)
  }
  refetch = async () => {
    await Promise.all(this.pages.map((page) => page.collection.utils.refetch()))
  }
  firstCollection = () => this.pages[0]!.collection
  collections = () => this.pages.map(({ collection }) => collection)
  dispose = () => {
    for (const subscription of this.subscriptions) subscription.unsubscribe()
    this.subscriptions = []
  }
}

export function mergeCanonicalPages<T extends { id: string }>(
  pages: readonly (readonly T[])[],
) {
  const byId = new Map<string, T>()
  for (const page of pages) for (const item of page) byId.set(item.id, item)
  return [...byId.values()]
}

const emptySnapshot: Snapshot<never> = {
  items: [],
  isLoading: true,
  isLoadingMore: false,
  isRefreshing: false,
  hasMore: false,
}
const serverController = {
  subscribe: () => () => {},
  snapshot: () => emptySnapshot,
  loadMore: () => {},
  refetch: async () => {},
}

const controllers = new Map<string, PagedController<never>>()

function controller<T extends { id: string }>(
  key: string,
  create: (cursor: string | undefined, notify: () => void) => PageEntry<T>,
) {
  const existing = controllers.get(key)
  if (existing) return existing as unknown as PagedController<T>
  const value = new PagedController(create)
  controllers.set(key, value as unknown as PagedController<never>)
  return value
}

function useApplicationController<T extends { id: string }>(
  key: string,
  create: () => PagedController<T>,
) {
  const value = useMemo(
    () => (typeof window === 'undefined' ? serverController : create()),
    [key],
  )
  const snapshot = useSyncExternalStore(
    value.subscribe,
    value.snapshot,
    value.snapshot,
  )
  return { ...snapshot, loadMore: value.loadMore, refetch: value.refetch }
}

function feedbackParams(filters: FeedbackCollectionFilters, cursor?: string) {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set('q', filters.q.trim())
  for (const status of filters.statuses) params.append('status', status)
  if (filters.category) params.set('category', filters.category)
  if (filters.sort !== 'popular') params.set('sort', filters.sort)
  if (cursor) params.set('cursor', cursor)
  return params
}

export function useFeedbackCollection(filters: FeedbackCollectionFilters) {
  const key = `feedback:${feedbackParams(filters)}`
  return useApplicationController(key, () =>
    controller<PublicFeedbackItem>(key, (cursor, notify) =>
      pageCollection({
        id: `${key}:${cursor ?? 'first'}`,
        url: `/api/feedback?${feedbackParams(filters, cursor)}`,
        parse: (raw) => PublicFeedbackPageSchema.parse(raw),
        notify,
        enrich: enrichVoteState,
        onInsert: async (items) => {
          for (const item of items)
            createdItems.set(
              item.id,
              PublicFeedbackItemSchema.parse(
                await post<unknown>('/api/feedback', {
                  title: item.title,
                  description: item.description,
                  type: item.type,
                  ...(item.category ? { categoryId: item.category.id } : {}),
                  tagIds: item.tags.map(({ id }) => id),
                }),
              ),
            )
        },
        onUpdate: persistVoteUpdates,
      }),
    ),
  )
}

export async function createFeedback(
  filters: FeedbackCollectionFilters,
  input: SubmitFeedbackInput,
) {
  const key = `feedback:${feedbackParams(filters)}`
  const value = controllers.get(key) as unknown as
    PagedController<PublicFeedbackItem> | undefined
  if (!value) throw new Error('The feedback collection is not active.')
  const now = new Date().toISOString()
  const category = input.categoryId
    ? publicTaxonomy.categories.find(({ id }) => id === input.categoryId)
    : undefined
  const temporary = PublicFeedbackItemSchema.parse({
    id: `pending-${crypto.randomUUID()}`,
    title: input.title,
    description: input.description,
    type: input.type,
    author: { id: 'viewer', displayName: 'You' },
    status: null,
    category: category ?? null,
    tags: input.tagIds.flatMap((id) => {
      const tag = publicTaxonomy.tags.find((candidate) => candidate.id === id)
      return tag ? [tag] : []
    }),
    voteCount: 0,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  const transaction = value.firstCollection().insert(temporary)
  try {
    await transaction.isPersisted.promise
    const created = createdItems.get(temporary.id)
    if (!created)
      throw new Error('The created feedback response was unavailable.')
    const utils = value.firstCollection().utils
    utils.writeBatch(() => {
      utils.writeDelete(temporary.id)
      utils.writeInsert(created)
    })
    createdItems.delete(temporary.id)
    return created
  } catch (error) {
    createdItems.delete(temporary.id)
    throw error
  }
}

export async function getFeedbackSuggestions(
  title: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ title })
  return FeedbackSuggestionsSchema.parse(
    await api<unknown>(
      `/api/feedback/suggestions?${params}`,
      signal ? { signal } : undefined,
    ),
  ).items
}

export function voteForExistingFeedback(
  feedbackItemId: string,
  voted: boolean,
) {
  return post<unknown>('/api/vote', { feedbackItemId, voted }).then((value) =>
    SetVoteResultSchema.parse(value),
  )
}

export async function setFeedbackVote(
  filters: FeedbackCollectionFilters,
  id: string,
  voted: boolean,
) {
  const key = `feedback:${feedbackParams(filters)}`
  return setCollectionVote(key, id, voted)
}

async function setCollectionVote(key: string, id: string, voted: boolean) {
  const value = controllers.get(key) as unknown as
    PagedController<PublicFeedbackItem> | undefined
  if (!value) throw new Error('The feedback collection is not active.')
  const collection = value
    .collections()
    .find((candidate) => candidate.state.has(id))
  if (!collection) throw new Error('The feedback item is not loaded.')
  const transaction = collection.update(id, (draft) => {
    const previous = draft.hasViewerVoted ?? false
    draft.hasViewerVoted = voted
    draft.voteCount = Math.max(
      0,
      draft.voteCount + (voted && !previous ? 1 : !voted && previous ? -1 : 0),
    )
  })
  try {
    await transaction.isPersisted.promise
    const canonical = canonicalVotes.get(id)
    if (canonical) {
      const current = collection.state.get(id)
      if (current)
        collection.utils.writeUpdate({
          ...current,
          hasViewerVoted: canonical.voted,
          voteCount: canonical.voteCount,
        })
    }
  } finally {
    canonicalVotes.delete(id)
  }
}

function roadmapParams(statuses: readonly string[], cursor?: string) {
  const params = new URLSearchParams()
  for (const status of statuses) params.append('status', status)
  if (cursor) params.set('cursor', cursor)
  return params
}

export function useRoadmapCollection(statuses: readonly string[]) {
  const key = `roadmap:${roadmapParams(statuses)}`
  return useApplicationController(key, () =>
    controller<PublicFeedbackItem>(key, (cursor, notify) =>
      pageCollection({
        id: `${key}:${cursor ?? 'first'}`,
        url: `/api/roadmap?${roadmapParams(statuses, cursor)}`,
        parse: (raw) => {
          const page = PublicRoadmapPageSchema.parse(raw)
          return {
            items: page.columns.flatMap(({ items }) => items),
            hasMore: page.hasMore,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          }
        },
        notify,
        enrich: enrichVoteState,
        onUpdate: persistVoteUpdates,
      }),
    ),
  )
}

export const setRoadmapVote = (
  statuses: readonly string[],
  id: string,
  voted: boolean,
) => setCollectionVote(`roadmap:${roadmapParams(statuses)}`, id, voted)

export function useCommentsCollection(feedbackItemId: string) {
  const key = `comments:${feedbackItemId}`
  return useApplicationController(key, () =>
    controller<PublicComment>(key, (cursor, notify) => {
      const params = new URLSearchParams({ feedbackItemId })
      if (cursor) params.set('cursor', cursor)
      return pageCollection({
        id: `${key}:${cursor ?? 'first'}`,
        url: `/api/comment?${params}`,
        parse: (raw) => PublicCommentPageSchema.parse(raw),
        notify,
        onInsert: async (items) => {
          for (const item of items)
            PublicCommentSchema.parse(
              await post<unknown>('/api/comment', {
                clientRequestId: item.id.replace(/^pending-/, ''),
                feedbackItemId,
                body: item.body,
              }),
            )
        },
      })
    }),
  )
}

export function createFeedbackComment(
  feedbackItemId: string,
  input: CreateCommentInput,
) {
  const value = controllers.get(`comments:${feedbackItemId}`) as unknown as
    PagedController<PublicComment> | undefined
  if (!value) throw new Error('The comment collection is not active.')
  const now = new Date().toISOString()
  return value.firstCollection().insert(
    PublicCommentSchema.parse({
      id: `pending-${input.clientRequestId}`,
      feedbackItemId,
      body: input.body,
      author: { id: 'viewer', displayName: 'You' },
      authorKind: 'customer',
      createdAt: now,
      updatedAt: now,
    }),
  ).isPersisted.promise
}

function useEditorial<T extends ChangelogEntry>(
  kind: 'changelog',
  parse: (raw: unknown) => Page<T>,
) {
  return useApplicationController(kind, () =>
    controller<T>(kind, (cursor, notify) => {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      return pageCollection({
        id: `${kind}:${cursor ?? 'first'}`,
        url: `/api/${kind}?${params}`,
        parse,
        notify,
      })
    }),
  )
}

export const useChangelogCollection = () =>
  useEditorial('changelog', (raw) => ChangelogPageSchema.parse(raw))

// Keep schema imports exercised at this boundary for canonical-model validation.
void RoadmapPageSchema
void ChangelogEntrySchema

export const collectionTesting = {
  pageCollection,
  PagedController,
  reset() {
    controllers.clear()
    collectionQueryClient.clear()
  },
}
