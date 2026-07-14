import {
  ChangelogPageSchema,
  CursorPageRequestSchema,
  FeedbackItemIdSchema,
  FeedbackFilterSchema,
  PublicCommentPageSchema,
  PublicFeedbackPageSchema,
  PublicRoadmapPageSchema,
  type PublicConnectorReader,
  type PublicFeedbackItem,
} from '@feedbax/core'
import { publicReader } from './public-feedback.server.js'
import { publicRoadmap, publicTaxonomy } from './portal.config.js'
import { applicationErrorResponse } from './application-errors.server.js'

function pageRequest(url: URL, defaultPageSize = 20) {
  const cursor = url.searchParams.get('cursor') || undefined
  const rawLimit = url.searchParams.get('limit')
  return CursorPageRequestSchema.parse({
    ...(cursor ? { cursor } : {}),
    pageSize: rawLimit ? Number(rawLimit) : defaultPageSize,
  })
}

const publicHeaders = {
  'cache-control': 'public, max-age=30, stale-while-revalidate=300',
}

function failure(
  request: Request,
  operation: string,
  message: string,
  error: unknown,
) {
  return applicationErrorResponse(request, operation, error, {
    code: 'INVALID_QUERY',
    message,
    status: 400,
    retryable: false,
  })
}

export async function commentListResponse(request: Request) {
  let feedbackItemId
  let page
  try {
    const url = new URL(request.url)
    feedbackItemId = FeedbackItemIdSchema.parse(
      url.searchParams.get('feedbackItemId'),
    )
    page = pageRequest(url)
  } catch (error) {
    return failure(
      request,
      'list-comments',
      'The comment query is invalid.',
      error,
    )
  }
  try {
    const reader = publicReader()
    if (!reader)
      return applicationErrorResponse(
        request,
        'list-comments',
        new Error('Connector configuration is unavailable.'),
      )
    const result = await reader.listComments(feedbackItemId, page)
    return Response.json(PublicCommentPageSchema.parse(result.value), {
      headers: { ...publicHeaders, 'x-feedbax-cache': result.cacheStatus },
    })
  } catch (error) {
    return applicationErrorResponse(request, 'list-comments', error)
  }
}

async function editorialResponse(
  request: Request,
  reader: Pick<PublicConnectorReader, 'listChangelog'> | null,
) {
  let page
  try {
    page = pageRequest(new URL(request.url))
  } catch (error) {
    return failure(
      request,
      'list-changelog',
      'The changelog query is invalid.',
      error,
    )
  }
  try {
    if (!reader)
      return applicationErrorResponse(
        request,
        'list-changelog',
        new Error('Connector configuration is unavailable.'),
      )
    const result = await reader.listChangelog(page)
    return Response.json(
      ChangelogPageSchema.parse({
        ...result.value,
        items: result.value.items.map((entry) => ({
          ...entry,
          linkedFeedbackItemIds: [],
        })),
      }),
      {
        headers: { ...publicHeaders, 'x-feedbax-cache': result.cacheStatus },
      },
    )
  } catch (error) {
    return applicationErrorResponse(request, 'list-changelog', error)
  }
}

const publicStatusById = new Map<
  string,
  (typeof publicTaxonomy.statuses)[number]
>(publicTaxonomy.statuses.map((status) => [status.id, status]))

export async function roadmapListResponse(
  request: Request,
  reader: Pick<PublicConnectorReader, 'listFeedback'> | null = publicReader(),
) {
  let selectedIds: string[]
  let page
  let filter
  try {
    const url = new URL(request.url)
    const configuredIds: string[] = [...publicRoadmap.columnStatusIds]
    const requestedIds = url.searchParams.getAll('status')
    if (requestedIds.some((id) => !configuredIds.includes(id as never)))
      throw new Error('INVALID_QUERY')
    selectedIds = requestedIds.length
      ? [...new Set(requestedIds)]
      : configuredIds
    page = pageRequest(url, 100)
    filter = FeedbackFilterSchema.parse({
      statusIds: selectedIds,
      sort: 'most-voted',
    })
  } catch (error) {
    return failure(
      request,
      'list-roadmap',
      'The roadmap filters are invalid.',
      error,
    )
  }
  try {
    if (!reader)
      return applicationErrorResponse(
        request,
        'list-roadmap',
        new Error('Connector configuration is unavailable.'),
      )
    const result = await reader.listFeedback(filter, page)
    const feedbackPage = PublicFeedbackPageSchema.parse(result.value)
    const grouped = new Map<string, PublicFeedbackItem[]>(
      selectedIds.map((id) => [id, []]),
    )
    for (const item of feedbackPage.items) {
      const items = item.status ? grouped.get(item.status.id) : undefined
      if (items) items.push(item)
    }
    return Response.json(
      PublicRoadmapPageSchema.parse({
        columns: selectedIds.map((id) => ({
          status: publicStatusById.get(id)!,
          items: grouped.get(id) ?? [],
        })),
        hasMore: feedbackPage.hasMore,
        ...(feedbackPage.nextCursor
          ? { nextCursor: feedbackPage.nextCursor }
          : {}),
      }),
      { headers: { ...publicHeaders, 'x-feedbax-cache': result.cacheStatus } },
    )
  } catch (error) {
    return applicationErrorResponse(request, 'list-roadmap', error)
  }
}
export const changelogListResponse = (
  request: Request,
  reader: Pick<PublicConnectorReader, 'listChangelog'> | null = publicReader(),
) => editorialResponse(request, reader)
