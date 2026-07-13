import { createServerFn } from '@tanstack/react-start'
import { envStatus } from './spike.js'
import { publicReader } from './public-feedback.server.js'
import {
  CursorPageRequestSchema,
  ChangelogSlugSchema,
  FeedbackItemIdSchema,
  PublicChangelogDetailSchema,
  PublicFeedbackDetailSchema,
  type PublicConnectorReader,
  type PublicFeedbackDetail,
  type PublicChangelogDetail,
} from '@feedbax/core'
import { portalPublicConfig } from './portal.config.js'

export const getServerStatus = createServerFn({ method: 'GET' }).handler(
  async () => ({
    primitive: 'server-function' as const,
    generatedAt: new Date().toISOString(),
    environment: envStatus(),
  }),
)

export const getFeedbackDetail = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const reader = publicReader()
    return reader ? loadFeedbackDetail(reader, id) : null
  })

export async function loadFeedbackDetail(
  reader: PublicConnectorReader,
  rawId: string,
): Promise<PublicFeedbackDetail | null> {
  const id = FeedbackItemIdSchema.parse(rawId)
  const item = await reader.getFeedback(id)
  if (!item) return null
  const page = CursorPageRequestSchema.parse({ pageSize: 100 })
  const [comments, roadmap, changelog] = await Promise.all([
    reader.listComments(id, page),
    reader.listRoadmap(page),
    reader.listChangelog(page),
  ])
  return PublicFeedbackDetailSchema.parse({
    item,
    comments: comments.value,
    roadmap: roadmap.value.items.filter((entry) => entry.linkedFeedbackItemIds.includes(id)),
    changelog: changelog.value.items
      .filter((entry) => entry.linkedFeedbackItemIds.includes(id))
      .map((entry) => ({ ...entry, linkedFeedbackItemIds: [id] })),
    subscription: { enabled: portalPublicConfig.subscriptions.enabled },
  })
}

export const getChangelogDetail = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const reader = publicReader()
    return reader ? loadChangelogDetail(reader, slug) : null
  })

export async function loadChangelogDetail(
  reader: PublicConnectorReader,
  rawSlug: string,
): Promise<PublicChangelogDetail | null> {
  const slug = ChangelogSlugSchema.parse(rawSlug)
  const entry = await reader.getChangelogEntry(slug)
  if (!entry) return null
  const ids = [...new Set(entry.linkedFeedbackItemIds)].slice(0, 20)
  const related = (await Promise.all(ids.map((id) => reader.getFeedback(id))))
    .filter((item) => item !== null)
  return PublicChangelogDetailSchema.parse({
    entry: { ...entry, linkedFeedbackItemIds: related.map(({ id }) => id) },
    relatedFeedback: related,
  })
}
