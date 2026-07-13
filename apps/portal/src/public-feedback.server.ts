import {
  CursorPageRequestSchema,
  FeedbackFilterSchema,
  FeedbackSuggestionsSchema,
  MemoryCacheAdapter,
  PublicFeedbackPageSchema,
  type PublicConnectorReader,
  FeedbackItemIdSchema,
} from '@feedbax/core'
import {
  createNotionReadClient,
  type NotionReadSetupConfig,
} from '@feedbax/notion'
import { readEnv } from './spike.js'
import { notionStatusMappings, publicTaxonomy } from './portal.config.js'
import { rankDuplicateSuggestions } from './duplicate-suggestions.js'
import { applicationErrorResponse } from './application-errors.server.js'

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
  if (statuses.some((id) => !knownStatuses.has(id as never)))
    throw new Error('INVALID_QUERY')
  if (category && !publicTaxonomy.categories.some(({ id }) => id === category))
    throw new Error('INVALID_QUERY')
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
    page: CursorPageRequestSchema.parse({
      ...(cursor ? { cursor } : {}),
      pageSize: limit,
    }),
  }
}

const setup: NotionReadSetupConfig = {
  dataSourceId: readEnv('NOTION_DATA_SOURCE_ID') ?? '',
  fields: {
    title: { property: 'Name', type: 'title', writable: true },
    description: { property: 'Description', type: 'rich_text', writable: true },
    feedbackType: { property: 'Type', type: 'select', writable: true },
    status: { property: 'Status', type: 'status', writable: true },
    commentCount: { property: 'Comment count', type: 'number', writable: true },
    optional: {
      category: { property: 'Category', type: 'select', writable: true },
      tags: { property: 'Tags', type: 'multi_select', writable: true },
      voteCount: { property: 'Vote count', type: 'number', writable: true },
    },
  },
  statuses: notionStatusMappings,
  statusDefinitions: Object.fromEntries(
    publicTaxonomy.statuses.map((status) => [
      status.id,
      {
        name: status.name,
        order: status.order,
        ...(status.description ? { description: status.description } : {}),
        ...(status.color ? { color: status.color } : {}),
        ...(status.isTerminal === undefined
          ? {}
          : { isTerminal: status.isTerminal }),
      },
    ]),
  ),
  categories: Object.fromEntries(
    publicTaxonomy.categories.map(({ id, name }) => [id, name]),
  ),
  feedbackTypes: {
    feature: 'Feature',
    bug: 'Bug',
    improvement: 'Improvement',
    question: 'Question',
  },
  tags: Object.fromEntries(
    publicTaxonomy.tags.map(({ id, name }) => [id, name]),
  ),
  ...(readEnv('NOTION_VOTES_DATA_SOURCE_ID')
    ? {
        votes: {
          dataSourceId: readEnv('NOTION_VOTES_DATA_SOURCE_ID')!,
          fields: {
            key: { property: 'Key', type: 'title', writable: true },
            feedbackItem: {
              property: 'Feedback',
              type: 'relation',
              writable: true,
            },
            voterKey: {
              property: 'Voter key',
              type: 'rich_text',
              writable: true,
            },
            active: { property: 'Active', type: 'checkbox', writable: true },
          },
        },
      }
    : {}),
  ...(readEnv('NOTION_COMMENTS_DATA_SOURCE_ID')
    ? {
        comments: {
          dataSourceId: readEnv('NOTION_COMMENTS_DATA_SOURCE_ID')!,
          fields: {
            key: { property: 'Key', type: 'title', writable: true },
            feedbackItem: {
              property: 'Feedback',
              type: 'relation',
              writable: true,
            },
            body: { property: 'Body', type: 'rich_text', writable: true },
            authorId: {
              property: 'Author ID',
              type: 'rich_text',
              writable: true,
            },
            authorName: {
              property: 'Author name',
              type: 'rich_text',
              writable: true,
            },
            authorAvatar: {
              property: 'Author avatar',
              type: 'url',
              writable: true,
            },
            authorKind: {
              property: 'Author kind',
              type: 'select',
              writable: true,
            },
          },
        },
      }
    : {}),
  ...(readEnv('NOTION_CHANGELOG_DATA_SOURCE_ID')
    ? {
        changelog: {
          dataSourceId: readEnv('NOTION_CHANGELOG_DATA_SOURCE_ID')!,
          fields: {
            title: { property: 'Name', type: 'title', writable: true },
            description: {
              property: 'Description',
              type: 'rich_text',
              writable: true,
            },
            slug: { property: 'Slug', type: 'rich_text', writable: true },
            publishedAt: {
              property: 'Published at',
              type: 'date',
              writable: true,
            },
            published: {
              property: 'Published',
              type: 'checkbox',
              writable: true,
            },
            version: { property: 'Version', type: 'rich_text', writable: true },
            tags: { property: 'Tags', type: 'multi_select', writable: true },
            coverImageUrl: {
              property: 'Cover image',
              type: 'url',
              writable: true,
            },
            linkedFeedbackItemIds: {
              property: 'Feedback',
              type: 'relation',
              writable: true,
            },
          },
        },
      }
    : {}),
}

export { cache as publicCache, setup as publicNotionSetup }

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
      return applicationErrorResponse(
        request,
        'list-feedback',
        new Error('Connector configuration is unavailable.'),
      )
    const result = await reader.listFeedback(filter, page)
    return Response.json(PublicFeedbackPageSchema.parse(result.value), {
      headers: {
        'cache-control': 'public, max-age=30, stale-while-revalidate=300',
        'x-feedbax-cache': result.cacheStatus,
      },
    })
  } catch (error) {
    const invalid =
      error instanceof Error &&
      (error.message === 'INVALID_QUERY' || error.name === 'ZodError')
    return applicationErrorResponse(
      request,
      'list-feedback',
      error,
      invalid
        ? {
            code: 'INVALID_QUERY',
            message: 'The feedback filters are invalid.',
            status: 400,
            retryable: false,
          }
        : undefined,
    )
  }
}

export async function feedbackDetailResponse(
  request: Request,
  feedbackItemId: string,
) {
  try {
    const id = FeedbackItemIdSchema.parse(feedbackItemId)
    const reader = publicReader()
    if (!reader)
      return applicationErrorResponse(
        request,
        'get-feedback',
        new Error('Connector configuration is unavailable.'),
      )
    const item = await reader.getFeedback(id)
    if (!item)
      return applicationErrorResponse(
        request,
        'get-feedback',
        new Error('Feedback was not found.'),
        {
          code: 'NOT_FOUND',
          message: 'Feedback was not found.',
          status: 404,
          retryable: false,
        },
      )
    return Response.json(item, {
      headers: {
        'cache-control': 'public, max-age=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError')
      return applicationErrorResponse(request, 'get-feedback', error, {
        code: 'NOT_FOUND',
        message: 'Feedback was not found.',
        status: 404,
        retryable: false,
      })
    return applicationErrorResponse(request, 'get-feedback', error)
  }
}

export function parseSuggestionRequest(url: URL) {
  const title = url.searchParams.get('title')?.trim() ?? ''
  if (title.length < 3 || title.length > 200) throw new Error('INVALID_QUERY')
  return title
}

export async function feedbackSuggestionsResponse(
  request: Request,
  reader: Pick<PublicConnectorReader, 'listFeedback'> | null = publicReader(),
) {
  try {
    const title = parseSuggestionRequest(new URL(request.url))
    if (!reader)
      return applicationErrorResponse(
        request,
        'suggest-feedback',
        new Error('Connector configuration is unavailable.'),
      )
    const result = await reader.listFeedback(
      { sort: 'recently-updated' },
      { pageSize: 100 },
    )
    return Response.json(
      FeedbackSuggestionsSchema.parse({
        items: rankDuplicateSuggestions(title, result.value.items),
      }),
      {
        headers: {
          'cache-control': 'public, max-age=30, stale-while-revalidate=300',
          'x-feedbax-cache': result.cacheStatus,
        },
      },
    )
  } catch (error) {
    const invalid = error instanceof Error && error.message === 'INVALID_QUERY'
    return applicationErrorResponse(
      request,
      'suggest-feedback',
      error,
      invalid
        ? {
            code: 'INVALID_QUERY',
            message: 'The suggestion title is invalid.',
            status: 400,
            retryable: false,
          }
        : undefined,
    )
  }
}
