import { createServerFn } from '@tanstack/react-start'
import { envStatus } from './spike.js'
import { publicReader } from './public-feedback.server.js'
import {
  CursorPageRequestSchema,
  FeedbackItemIdSchema,
  PublicFeedbackDetailSchema,
  type PublicConnectorReader,
  type PublicFeedbackDetail,
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
    changelog: changelog.value.items.filter((entry) => entry.linkedFeedbackItemIds.includes(id)),
    subscription: { enabled: portalPublicConfig.subscriptions.enabled },
  })
}
