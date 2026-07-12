import {
  PublicFeedbackItemSchema,
  invalidateAfterMutation,
  type CacheAdapter,
  type PublicFeedbackItem,
  type PublicUser,
  type SubmitFeedbackInput,
} from '@feedbax/core'
import type { NotionSetupConfig } from './index.js'

const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'

export interface NotionMutationOptions {
  readonly token: string
  readonly setup: NotionSetupConfig
  readonly fetch?: typeof fetch
  readonly cache?: CacheAdapter
}

export const richText = (value: string) =>
  Array.from({ length: Math.ceil(value.length / 2000) }, (_, index) => ({
    type: 'text' as const,
    text: { content: value.slice(index * 2000, (index + 1) * 2000) },
  }))

export function createNotionMutationService(options: NotionMutationOptions) {
  const fetcher = options.fetch ?? fetch
  return {
    async submit(
      input: SubmitFeedbackInput,
      author: PublicUser,
    ): Promise<PublicFeedbackItem> {
      const fields = options.setup.fields
      const properties: Record<string, unknown> = {
        [fields.title.property]: { title: richText(input.title) },
        [fields.description.property]: { rich_text: richText(input.description) },
        [fields.feedbackType.property]: {
          select: { name: options.setup.feedbackTypes?.[input.type] ?? input.type },
        },
        [fields.status.property]: {
          [fields.status.type]: { name: options.setup.statuses.open ?? 'Open' },
        },
        [fields.commentCount.property]: { number: 0 },
      }
      const category = fields.optional?.category
      if (category && input.categoryId)
        properties[category.property] = {
          select: { name: options.setup.categories?.[input.categoryId] ?? input.categoryId },
        }
      const tags = fields.optional?.tags
      if (tags && input.tagIds.length)
        properties[tags.property] = {
          multi_select: input.tagIds.map((id) => ({
            name: options.setup.tags?.[id] ?? id,
          })),
        }
      const voteCount = fields.optional?.voteCount
      if (voteCount?.writable) properties[voteCount.property] = { number: 0 }

      let response: Response
      try {
        response = await fetcher(`${API}/pages`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.token}`,
            'notion-version': VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            parent: { type: 'data_source_id', data_source_id: options.setup.dataSourceId },
            properties,
          }),
        })
      } catch {
        throw new Error('Notion is temporarily unavailable.')
      }
      if (!response.ok) throw new Error('Notion could not create feedback.')
      const page = await response.json() as {
        id?: string
        created_time?: string
        last_edited_time?: string
      }
      const createdAt = page.created_time ?? new Date().toISOString()
      const item = PublicFeedbackItemSchema.parse({
        id: page.id,
        title: input.title,
        description: input.description,
        type: input.type,
        author,
        status: {
          id: 'open', name: options.setup.statuses.open ?? 'Open', order: 0,
          isTerminal: false,
        },
        category: input.categoryId ? {
          id: input.categoryId,
          name: options.setup.categories?.[input.categoryId] ?? input.categoryId,
          order: 0,
        } : null,
        tags: input.tagIds.map((id, order) => ({
          id, name: options.setup.tags?.[id] ?? id, order,
        })),
        voteCount: 0,
        commentCount: 0,
        createdAt,
        updatedAt: page.last_edited_time ?? createdAt,
      })
      if (options.cache)
        await invalidateAfterMutation(options.cache, 'feedback', 'notion')
      return item
    },
  }
}
