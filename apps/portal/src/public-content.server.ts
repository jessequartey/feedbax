import {
  ChangelogPageSchema,
  CursorPageRequestSchema,
  FeedbackItemIdSchema,
  PublicCommentPageSchema,
  RoadmapPageSchema,
  type ChangelogPage,
  type RoadmapPage,
} from '@feedbax/core'
import { publicReader } from './public-feedback.server.js'

function pageRequest(url: URL) {
  const cursor = url.searchParams.get('cursor') || undefined
  const rawLimit = url.searchParams.get('limit')
  return CursorPageRequestSchema.parse({
    ...(cursor ? { cursor } : {}),
    pageSize: rawLimit ? Number(rawLimit) : 20,
  })
}

const publicHeaders = {
  'cache-control': 'public, max-age=30, stale-while-revalidate=300',
}

function failure(message: string) {
  return Response.json(
    { error: { code: 'INVALID_QUERY', message } },
    { status: 400, headers: { 'cache-control': 'no-store' } },
  )
}

export async function commentListResponse(request: Request) {
  try {
    const url = new URL(request.url)
    const feedbackItemId = FeedbackItemIdSchema.parse(url.searchParams.get('feedbackItemId'))
    const page = pageRequest(url)
    const reader = publicReader()
    if (!reader) return Response.json(PublicCommentPageSchema.parse({ items: [], hasMore: false }), { headers: { ...publicHeaders, 'x-feedbax-cache': 'bypass' } })
    const result = await reader.listComments(feedbackItemId, page)
    return Response.json(PublicCommentPageSchema.parse(result.value), { headers: { ...publicHeaders, 'x-feedbax-cache': result.cacheStatus } })
  } catch (error) {
    const invalid = error instanceof Error && error.name === 'ZodError'
    return invalid ? failure('The comment query is invalid.') : Response.json({ error: { code: 'CONNECTOR_UNAVAILABLE', message: 'Comments are temporarily unavailable.' } }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}

async function editorialResponse(
  request: Request,
  kind: 'roadmap' | 'changelog',
) {
  try {
    const page = pageRequest(new URL(request.url))
    const reader = publicReader()
    const empty = { items: [], hasMore: false }
    if (!reader)
      return Response.json(
        kind === 'roadmap'
          ? RoadmapPageSchema.parse(empty)
          : ChangelogPageSchema.parse(empty),
        { headers: { ...publicHeaders, 'x-feedbax-cache': 'bypass' } },
      )
    const result = kind === 'roadmap'
      ? await reader.listRoadmap(page)
      : await reader.listChangelog(page)
    const value: RoadmapPage | ChangelogPage = result.value
    return Response.json(value, {
      headers: { ...publicHeaders, 'x-feedbax-cache': result.cacheStatus },
    })
  } catch {
    return failure(`The ${kind} query is invalid.`)
  }
}

export const roadmapListResponse = (request: Request) =>
  editorialResponse(request, 'roadmap')
export const changelogListResponse = (request: Request) =>
  editorialResponse(request, 'changelog')
