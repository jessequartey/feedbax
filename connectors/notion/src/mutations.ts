import {
  PublicFeedbackItemSchema,
  SetVoteResultSchema,
  CreateCommentResultSchema,
  invalidateAfterMutation,
  type CacheAdapter,
  type PublicFeedbackItem,
  type PublicUser,
  type SubmitFeedbackInput,
  type SetVoteInput,
  type SetVoteResult,
  type CreateCommentInput,
  type PublicComment,
} from '@feedbax/core'
import type { NotionSetupConfig } from './index.js'

const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const voteLocks = new Map<string, Promise<void>>()
const commentLocks = new Map<string, Promise<void>>()

async function withVoteLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = voteLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  voteLocks.set(key, queued)
  await previous
  try { return await work() } finally {
    release()
    if (voteLocks.get(key) === queued) voteLocks.delete(key)
  }
}
async function withCommentLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = commentLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  commentLocks.set(key, queued)
  await previous
  try { return await work() } finally {
    release()
    if (commentLocks.get(key) === queued) commentLocks.delete(key)
  }
}

export interface NotionMutationOptions {
  readonly token: string
  readonly setup: NotionSetupConfig
  readonly fetch?: typeof fetch
  readonly cache?: CacheAdapter
  readonly interactionHashKey?: string
}

export const richText = (value: string) =>
  Array.from({ length: Math.ceil(value.length / 2000) }, (_, index) => ({
    type: 'text' as const,
    text: { content: value.slice(index * 2000, (index + 1) * 2000) },
  }))

export function createNotionMutationService(options: NotionMutationOptions) {
  const fetcher = options.fetch ?? fetch
  const openStatus = options.setup.statuses.open
  const openStatusName = Array.isArray(openStatus) ? openStatus[0] : openStatus
  const voterKey = async (userId: string) => {
    if (!options.interactionHashKey || new TextEncoder().encode(options.interactionHashKey).byteLength < 32) throw new Error('Voting is not configured.')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(options.interactionHashKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId))
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  const notion = async <T = unknown>(path: string, init: RequestInit): Promise<T> => {
    const response = await fetcher(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${options.token}`, 'notion-version': VERSION, 'content-type': 'application/json', ...init.headers } })
    if (!response.ok) throw new Error('Notion could not save the mutation.')
    return response.json() as Promise<T>
  }
  const queryAll = async <T>(dataSourceId: string, body: Record<string, unknown>): Promise<T[]> => {
    const items: T[] = []
    let cursor: string | undefined
    do {
      const page = await notion<{ results?: T[]; has_more?: boolean; next_cursor?: string | null }>(`/data_sources/${encodeURIComponent(dataSourceId)}/query`, { method: 'POST', body: JSON.stringify({ ...body, ...(cursor ? { start_cursor: cursor } : {}) }) })
      items.push(...(page.results ?? []))
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined
    } while (cursor)
    return items
  }
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
          [fields.status.type]: { name: openStatusName ?? 'Open' },
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
          id: 'open',
          name: options.setup.statusDefinitions?.open?.name ?? 'open',
          order: options.setup.statusDefinitions?.open?.order ?? 0,
          isTerminal: options.setup.statusDefinitions?.open?.isTerminal ?? false,
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
    async setVote(userId: string, input: SetVoteInput): Promise<SetVoteResult> {
      const setup = options.setup.votes
      const countField = options.setup.fields.optional?.voteCount
      if (!setup || !countField?.writable || !options.interactionHashKey || new TextEncoder().encode(options.interactionHashKey).byteLength < 32)
        throw new Error('Voting is not configured.')
      return withVoteLock(input.feedbackItemId, async () => {
        const hash = await voterKey(userId)
        const feedback = await notion<{ parent?: { type?: string; data_source_id?: string }; properties?: Record<string, { checkbox?: boolean }> }>(`/pages/${encodeURIComponent(input.feedbackItemId)}`, { method: 'GET' })
        const visibility = options.setup.fields.optional?.visibility
        if (feedback.parent?.type !== 'data_source_id' || feedback.parent.data_source_id !== options.setup.dataSourceId || (visibility && feedback.properties?.[visibility.property]?.checkbox === false))
          throw new Error('Feedback was not found.')
        const filter = { and: [
          { property: setup.fields.feedbackItem.property, relation: { contains: input.feedbackItemId } },
          { property: setup.fields.voterKey.property, rich_text: { equals: hash } },
        ] }
        const found = await notion<{ results?: Array<{ id: string; properties?: Record<string, { checkbox?: boolean }> }> }>(`/data_sources/${encodeURIComponent(setup.dataSourceId)}/query`, { method: 'POST', body: JSON.stringify({ page_size: 100, filter }) })
        const existing = found.results?.[0]
        const active = existing?.properties?.[setup.fields.active.property]?.checkbox === true
        if (active !== input.voted) {
          if (existing)
            await notion(`/pages/${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: JSON.stringify({ properties: { [setup.fields.active.property]: { checkbox: input.voted } } }) })
          else if (input.voted)
            await notion('/pages', { method: 'POST', body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: setup.dataSourceId }, properties: {
              [setup.fields.key.property]: { title: richText(`${input.feedbackItemId}:${hash}`) },
              [setup.fields.feedbackItem.property]: { relation: [{ id: input.feedbackItemId }] },
              [setup.fields.voterKey.property]: { rich_text: richText(hash) },
              [setup.fields.active.property]: { checkbox: true },
            } }) })
        }
        const activeVotes = await queryAll<{ properties?: Record<string, { rich_text?: Array<{ plain_text?: string }> }> }>(setup.dataSourceId, { page_size: 100, filter: { and: [
          { property: setup.fields.feedbackItem.property, relation: { contains: input.feedbackItemId } },
          { property: setup.fields.active.property, checkbox: { equals: true } },
        ] } })
        const unique = new Set(activeVotes.map((row) => row.properties?.[setup.fields.voterKey.property]?.rich_text?.map((part) => part.plain_text ?? '').join('')).filter(Boolean))
        const voteCount = unique.size
        await notion(`/pages/${encodeURIComponent(input.feedbackItemId)}`, { method: 'PATCH', body: JSON.stringify({ properties: { [countField.property]: { number: voteCount } } }) })
        if (options.cache) await invalidateAfterMutation(options.cache, 'vote', 'notion', input.feedbackItemId)
        return SetVoteResultSchema.parse({ feedbackItemId: input.feedbackItemId, voted: input.voted, voteCount })
      })
    },
    async createComment(author: PublicUser, authorKind: 'customer' | 'team' | 'administrator', input: CreateCommentInput): Promise<PublicComment> {
      const setup = options.setup.comments
      if (!setup) throw new Error('Comments are not configured.')
      return withCommentLock(input.feedbackItemId, async () => {
        const feedback = await notion<{ parent?: { type?: string; data_source_id?: string }; properties?: Record<string, { checkbox?: boolean }> }>(`/pages/${encodeURIComponent(input.feedbackItemId)}`, { method: 'GET' })
        const visibility = options.setup.fields.optional?.visibility
        if (feedback.parent?.type !== 'data_source_id' || feedback.parent.data_source_id !== options.setup.dataSourceId || (visibility && feedback.properties?.[visibility.property]?.checkbox === false))
          throw new Error('Feedback was not found.')
        type CommentPage = { id: string; created_time?: string; last_edited_time?: string; properties?: Record<string, { title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }>; url?: string | null; select?: { name?: string } | null }> }
        const existing = await notion<{ results?: CommentPage[] }>(`/data_sources/${encodeURIComponent(setup.dataSourceId)}/query`, { method: 'POST', body: JSON.stringify({ page_size: 1, filter: { and: [
          { property: setup.fields.key.property, title: { equals: input.clientRequestId } },
          { property: setup.fields.feedbackItem.property, relation: { contains: input.feedbackItemId } },
          { property: setup.fields.authorId.property, rich_text: { equals: author.id } },
        ] } }) })
        let page = existing.results?.[0]
        if (!page) page = await notion<CommentPage>('/pages', { method: 'POST', body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: setup.dataSourceId }, properties: {
          [setup.fields.key.property]: { title: richText(input.clientRequestId) },
          [setup.fields.feedbackItem.property]: { relation: [{ id: input.feedbackItemId }] },
          [setup.fields.body.property]: { rich_text: richText(input.body) },
          [setup.fields.authorId.property]: { rich_text: richText(author.id) },
          [setup.fields.authorName.property]: { rich_text: richText(author.displayName) },
          ...(setup.fields.authorAvatar && author.avatarUrl ? { [setup.fields.authorAvatar.property]: { url: author.avatarUrl } } : {}),
          [setup.fields.authorKind.property]: { select: { name: authorKind } },
        } }) })
        const all = await queryAll<unknown>(setup.dataSourceId, { page_size: 100, filter: { property: setup.fields.feedbackItem.property, relation: { contains: input.feedbackItemId } } })
        await notion(`/pages/${encodeURIComponent(input.feedbackItemId)}`, { method: 'PATCH', body: JSON.stringify({ properties: { [options.setup.fields.commentCount.property]: { number: all.length } } }) })
        if (options.cache) await invalidateAfterMutation(options.cache, 'comment', 'notion', input.feedbackItemId)
        const now = new Date().toISOString()
        return CreateCommentResultSchema.parse({ id: page.id, feedbackItemId: input.feedbackItemId, body: input.body, author, authorKind, createdAt: page.created_time ?? now, updatedAt: page.last_edited_time ?? page.created_time ?? now })
      })
    },
    async voteStates(userId: string, feedbackItemIds: readonly string[]) {
      const setup = options.setup.votes
      if (!setup || !options.interactionHashKey) throw new Error('Voting is not configured.')
      const hash = await voterKey(userId)
      const result = await notion<{ results?: Array<{ properties?: Record<string, { relation?: Array<{ id: string }> }> }> }>(`/data_sources/${encodeURIComponent(setup.dataSourceId)}/query`, { method: 'POST', body: JSON.stringify({ page_size: 100, filter: { and: [
        { property: setup.fields.voterKey.property, rich_text: { equals: hash } },
        { property: setup.fields.active.property, checkbox: { equals: true } },
        { or: feedbackItemIds.map((id) => ({ property: setup.fields.feedbackItem.property, relation: { contains: id } })) },
      ] } }) })
      const active = new Set((result.results ?? []).flatMap((row) => row.properties?.[setup.fields.feedbackItem.property]?.relation?.map(({ id }) => id) ?? []))
      return feedbackItemIds.map((feedbackItemId) => ({ feedbackItemId, voted: active.has(feedbackItemId) }))
    },
  }
}
