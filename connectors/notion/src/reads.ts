import {
  ChangelogPageSchema,
  CursorPageRequestSchema,
  FeedbackFilterSchema,
  PublicFeedbackPageSchema,
  RoadmapPageSchema,
  cacheTags,
  cachedRead,
  invalidateAfterMutation,
  type CacheAdapter,
  type CacheObserver,
  type CacheScheduler,
  type ChangelogPage,
  type CursorPageRequest,
  type FeedbackFilter,
  type PublicConnectorReader,
  type RoadmapPage,
} from '@feedbax/core'
import type { NotionFieldMapping, NotionSetupConfig } from './index.js'

const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'

export interface NotionEditorialConfig {
  readonly dataSourceId: string
  readonly fields: {
    readonly title: NotionFieldMapping
    readonly description: NotionFieldMapping
    readonly status?: NotionFieldMapping
    readonly version?: NotionFieldMapping
    readonly linkedFeedbackItemIds?: NotionFieldMapping
  }
}

export interface NotionReadSetupConfig extends NotionSetupConfig {
  readonly roadmap?: NotionEditorialConfig
  readonly changelog?: NotionEditorialConfig
}

export interface NotionReadClientOptions {
  readonly token: string
  readonly setup: NotionReadSetupConfig
  readonly fetch?: typeof fetch
  readonly cache?: CacheAdapter
  readonly observe?: CacheObserver
  readonly schedule?: CacheScheduler
  readonly now?: () => number
  readonly freshMs?: number
  readonly staleMs?: number
}

type NotionPage = {
  id: string
  created_time: string
  last_edited_time: string
  properties: Record<
    string,
    {
      type?: string
      title?: Rich[]
      rich_text?: Rich[]
      number?: number | null
      status?: { id?: string; name?: string } | null
      select?: { id?: string; name?: string } | null
      relation?: { id: string }[]
      multi_select?: { name?: string }[]
    }
  >
}
type Rich = { plain_text?: string }
type QueryResponse = {
  results?: NotionPage[]
  has_more?: boolean
  next_cursor?: string | null
}

const text = (page: NotionPage, mapping: NotionFieldMapping) => {
  const property = page.properties[mapping.property]
  return [...(property?.title ?? []), ...(property?.rich_text ?? [])]
    .map((part) => part.plain_text ?? '')
    .join('')
    .trim()
}
const status = (page: NotionPage, mapping?: NotionFieldMapping) => {
  if (!mapping) return null
  const value = page.properties[mapping.property]
  const option = value?.status ?? value?.select
  return option?.name
    ? {
        id: option.id ?? option.name,
        name: option.name,
        order: 0,
        isTerminal: false,
      }
    : null
}
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function publicError(message: string, cause?: unknown): Error {
  const error = new Error(message)
  Object.defineProperty(error, 'cause', { value: cause, enumerable: false })
  return error
}

export function createNotionReadClient(
  options: NotionReadClientOptions,
): PublicConnectorReader & {
  updateCommentCount(feedbackItemId: string, count: number): Promise<void>
} {
  const fetcher = options.fetch ?? fetch
  const common = {
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.observe ? { observe: options.observe } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.freshMs === undefined ? {} : { freshMs: options.freshMs }),
    ...(options.staleMs === undefined ? {} : { staleMs: options.staleMs }),
  }
  const query = async (
    dataSourceId: string,
    page: CursorPageRequest,
    filter?: FeedbackFilter,
  ): Promise<QueryResponse> => {
    const body: Record<string, unknown> = { page_size: page.pageSize }
    if (page.cursor) body.start_cursor = page.cursor
    if (filter?.sort)
      body.sorts = [
        {
          timestamp:
            filter.sort === 'newest' || filter.sort === 'oldest'
              ? 'created_time'
              : 'last_edited_time',
          direction: filter.sort === 'oldest' ? 'ascending' : 'descending',
        },
      ]
    let response: Response
    try {
      response = await fetcher(
        `${API}/data_sources/${encodeURIComponent(dataSourceId)}/query`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.token}`,
            'notion-version': VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
    } catch (cause) {
      throw publicError('Notion is temporarily unavailable.', cause)
    }
    if (!response.ok)
      throw publicError(
        response.status === 429
          ? 'Notion is rate-limiting requests.'
          : 'Notion could not load public data.',
      )
    const value = (await response.json().catch((cause) => {
      throw publicError('Notion returned an invalid response.', cause)
    })) as QueryResponse
    if (!Array.isArray(value.results) || typeof value.has_more !== 'boolean')
      throw publicError('Notion returned an invalid response.')
    return value
  }
  const pageShape = (result: QueryResponse) => ({
    hasMore: result.has_more ?? false,
    ...(result.next_cursor ? { nextCursor: result.next_cursor } : {}),
  })

  return {
    async listFeedback(rawFilter, rawPage) {
      const filter = FeedbackFilterSchema.parse(rawFilter)
      const page = CursorPageRequestSchema.parse(rawPage)
      return cachedRead({
        ...common,
        key: `notion:${options.setup.dataSourceId}:feedback:${stable({ filter, page })}`,
        tags: [cacheTags.feedback('notion')],
        load: async () => {
          const result = await query(options.setup.dataSourceId, page, filter)
          return PublicFeedbackPageSchema.parse({
            ...pageShape(result),
            items: result.results!.map((item) => ({
              id: item.id,
              title: text(item, options.setup.fields.title),
              description: text(item, options.setup.fields.description),
              author: { id: 'notion', displayName: 'Notion' },
              status: status(item, options.setup.fields.status),
              category: null,
              tags: [],
              voteCount: 0,
              commentCount:
                item.properties[options.setup.fields.commentCount.property]
                  ?.number ?? 0,
              createdAt: item.created_time,
              updatedAt: item.last_edited_time,
            })),
          })
        },
      })
    },
    async listRoadmap(rawPage) {
      const page = CursorPageRequestSchema.parse(rawPage)
      const setup = options.setup.roadmap
      if (!setup)
        return {
          value: RoadmapPageSchema.parse({ items: [], hasMore: false }),
          cacheStatus: 'bypass' as const,
        }
      return cachedRead({
        ...common,
        key: `notion:${setup.dataSourceId}:roadmap:${stable(page)}`,
        tags: [cacheTags.roadmap('notion')],
        load: async (): Promise<RoadmapPage> => {
          const result = await query(setup.dataSourceId, page)
          return RoadmapPageSchema.parse({
            ...pageShape(result),
            items: result.results!.map((item) => ({
              id: item.id,
              title: text(item, setup.fields.title),
              description: text(item, setup.fields.description),
              status: status(item, setup.fields.status),
              linkedFeedbackItemIds: setup.fields.linkedFeedbackItemIds
                ? (
                    item.properties[setup.fields.linkedFeedbackItemIds.property]
                      ?.relation ?? []
                  ).map(({ id }) => id)
                : [],
              createdAt: item.created_time,
              updatedAt: item.last_edited_time,
            })),
          })
        },
      })
    },
    async listChangelog(rawPage) {
      const page = CursorPageRequestSchema.parse(rawPage)
      const setup = options.setup.changelog
      if (!setup)
        return {
          value: ChangelogPageSchema.parse({ items: [], hasMore: false }),
          cacheStatus: 'bypass' as const,
        }
      return cachedRead({
        ...common,
        key: `notion:${setup.dataSourceId}:changelog:${stable(page)}`,
        tags: [cacheTags.changelog('notion')],
        load: async (): Promise<ChangelogPage> => {
          const result = await query(setup.dataSourceId, page)
          return ChangelogPageSchema.parse({
            ...pageShape(result),
            items: result.results!.map((item) => ({
              id: item.id,
              title: text(item, setup.fields.title),
              description: text(item, setup.fields.description),
              version: setup.fields.version
                ? text(item, setup.fields.version) || undefined
                : undefined,
              linkedFeedbackItemIds: setup.fields.linkedFeedbackItemIds
                ? (
                    item.properties[setup.fields.linkedFeedbackItemIds.property]
                      ?.relation ?? []
                  ).map(({ id }) => id)
                : [],
              createdAt: item.created_time,
              updatedAt: item.last_edited_time,
            })),
          })
        },
      })
    },
    async updateCommentCount(feedbackItemId, count) {
      const response = await fetcher(
        `${API}/pages/${encodeURIComponent(feedbackItemId)}`,
        {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${options.token}`,
            'notion-version': VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            properties: {
              [options.setup.fields.commentCount.property]: { number: count },
            },
          }),
        },
      )
      if (!response.ok)
        throw publicError('Notion could not update the comment count.')
      if (options.cache)
        await invalidateAfterMutation(
          options.cache,
          'comment',
          'notion',
          feedbackItemId,
          options.observe,
        )
    },
  }
}
