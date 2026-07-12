import {
  CursorPageRequestSchema,
  FeedbackFilterSchema,
  MemoryCacheAdapter,
  PublicFeedbackPageSchema,
} from '@feedbax/core'
import { createNotionReadClient, type NotionReadSetupConfig } from '@feedbax/notion'
import { readEnv } from './spike.js'
import { publicTaxonomy } from './portal.config.js'

const cache = new MemoryCacheAdapter()
const sortMap = {
  popular: 'most-voted',
  recent: 'newest',
  updated: 'recently-updated',
} as const

export function parseFeedbackRequest(url: URL) {
  const sort = url.searchParams.get('sort') ?? 'popular'
  if (!(sort in sortMap)) throw new Error('INVALID_QUERY')
  const knownStatuses = new Set(publicTaxonomy.statuses.map(({ id }) => id))
  const statuses = url.searchParams.getAll('status')
  const category = url.searchParams.get('category') ?? undefined
  if (statuses.some((id) => !knownStatuses.has(id as never))) throw new Error('INVALID_QUERY')
  if (category && !publicTaxonomy.categories.some(({ id }) => id === category)) throw new Error('INVALID_QUERY')
  const q = url.searchParams.get('q')?.trim() || undefined
  const cursor = url.searchParams.get('cursor') || undefined
  const limitValue = url.searchParams.get('limit')
  const limit = limitValue ? Number(limitValue) : 20
  return {
    filter: FeedbackFilterSchema.parse({
      ...(q ? { search: q } : {}),
      ...(statuses.length ? { statusIds: statuses } : {}),
      ...(category ? { categoryId: category } : {}),
      sort: sortMap[sort as keyof typeof sortMap],
    }),
    page: CursorPageRequestSchema.parse({ ...(cursor ? { cursor } : {}), pageSize: limit }),
  }
}

const setup: NotionReadSetupConfig = {
  dataSourceId: readEnv('NOTION_DATA_SOURCE_ID') ?? '',
  fields: {
    title: { property: 'Name', type: 'title', writable: true },
    description: { property: 'Description', type: 'rich_text', writable: true },
    status: { property: 'Status', type: 'status', writable: true },
    commentCount: { property: 'Comment count', type: 'number', writable: true },
    optional: {
      category: { property: 'Category', type: 'select', writable: true },
      voteCount: { property: 'Vote count', type: 'number', writable: false },
    },
  },
  statuses: Object.fromEntries(publicTaxonomy.statuses.map(({ id, name }) => [id, name])),
  categories: Object.fromEntries(publicTaxonomy.categories.map(({ id, name }) => [id, name])),
}

export function publicReader() {
  const token = readEnv('NOTION_TOKEN')
  return setup.dataSourceId && token
    ? createNotionReadClient({ token, setup, cache })
    : null
}

export async function feedbackListResponse(request: Request) {
  try {
    const { filter, page } = parseFeedbackRequest(new URL(request.url))
    const reader = publicReader()
    if (!reader)
      return Response.json(PublicFeedbackPageSchema.parse({ items: [], hasMore: false }), {
        headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=300', 'x-feedbax-cache': 'bypass' },
      })
    const result = await reader.listFeedback(filter, page)
    return Response.json(PublicFeedbackPageSchema.parse(result.value), {
      headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=300', 'x-feedbax-cache': result.cacheStatus },
    })
  } catch (error) {
    const invalid = error instanceof Error && (error.message === 'INVALID_QUERY' || error.name === 'ZodError')
    return Response.json(
      { error: { code: invalid ? 'INVALID_QUERY' : 'CONNECTOR_UNAVAILABLE', message: invalid ? 'The feedback filters are invalid.' : 'Feedback is temporarily unavailable.' } },
      { status: invalid ? 400 : 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
