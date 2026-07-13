import {
  FeedbackFilterSchema,
  PublicFeedbackItemSchema,
  SetVoteResultSchema,
  unsupportedConnectorOperation,
  type ChangelogEntry,
  type ConnectorRuntime,
  type PublicComment,
  type PublicFeedbackItem,
  type RoadmapEntry,
} from '@feedbax/core'

const timestamp = '2026-07-13T08:00:00Z'
const status = {
  open: {
    id: 'open',
    name: 'Open',
    order: 0,
    isTerminal: false,
  },
  planned: {
    id: 'planned',
    name: 'Planned',
    order: 1,
    isTerminal: false,
  },
  complete: {
    id: 'complete',
    name: 'Complete',
    order: 3,
    isTerminal: true,
  },
} as const

function item(
  id: string,
  title: string,
  description: string,
  itemStatus: (typeof status)[keyof typeof status],
  voteCount: number,
): PublicFeedbackItem {
  return PublicFeedbackItemSchema.parse({
    id,
    title,
    description,
    type: 'feature',
    author: { id: 'mock-author', displayName: 'Feedbax Team' },
    status: itemStatus,
    category: { id: 'feature', name: 'Feature', order: 0 },
    tags: [],
    voteCount,
    commentCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

class MockConnectorState {
  failed = false
  sequence = 0
  items: PublicFeedbackItem[] = []
  comments = new Map<string, PublicComment[]>()
  votes = new Map<string, Set<string>>()

  reset() {
    this.failed = false
    this.sequence = 0
    this.items = [
      item(
        'feedback-offline',
        'Offline mode',
        'Let people review feedback without a network connection.',
        status.planned,
        8,
      ),
      item(
        'feedback-export',
        'Export CSV reports',
        'Download filtered feedback as a CSV file.',
        status.open,
        4,
      ),
      item(
        'feedback-changelog',
        'Linked changelog entries',
        'Show the release that completed a feedback request.',
        status.complete,
        12,
      ),
    ]
    this.comments.clear()
    this.votes.clear()
  }

  assertAvailable() {
    if (this.failed) throw new Error('Synthetic connector outage detail.')
  }
}

const state = new MockConnectorState()
state.reset()

const changelog: ChangelogEntry = {
  id: 'release-linked-changelog' as ChangelogEntry['id'],
  title: 'Feedback release links',
  description: 'Completed feedback now links directly to this **release**.',
  slug: 'feedback-release-links',
  version: 'v0.0.2',
  publishedAt: timestamp,
  linkedFeedbackItemIds: ['feedback-changelog' as PublicFeedbackItem['id']],
  tags: [],
  createdAt: timestamp,
  updatedAt: timestamp,
}

const roadmap: RoadmapEntry = {
  id: 'roadmap-planned' as RoadmapEntry['id'],
  title: 'Planned feedback',
  description: 'Synthetic roadmap fixture.',
  status: status.planned as RoadmapEntry['status'],
  linkedFeedbackItemIds: ['feedback-offline' as PublicFeedbackItem['id']],
  createdAt: timestamp,
  updatedAt: timestamp,
}

function runtime(): ConnectorRuntime {
  return {
    descriptor: {
      id: 'mock',
      displayName: 'Deterministic mock',
      capabilities: ['comments'],
    },
    reader: {
      listFeedback: async (rawFilter) => {
        state.assertAvailable()
        const filter = FeedbackFilterSchema.parse(rawFilter)
        let items = [...state.items]
        if (filter.search) {
          const query = filter.search.toLowerCase()
          items = items.filter(
            (candidate) =>
              candidate.title.toLowerCase().includes(query) ||
              candidate.description.toLowerCase().includes(query),
          )
        }
        if (filter.statusIds?.length)
          items = items.filter(
            (candidate) =>
              candidate.status &&
              filter.statusIds!.includes(candidate.status.id),
          )
        if (filter.categoryId)
          items = items.filter(
            (candidate) => candidate.category?.id === filter.categoryId,
          )
        items.sort((left, right) =>
          filter.sort === 'most-voted'
            ? right.voteCount - left.voteCount
            : right.createdAt.localeCompare(left.createdAt),
        )
        return {
          value: { items, hasMore: false },
          cacheStatus: 'bypass',
        }
      },
      getFeedback: async (id) => {
        state.assertAvailable()
        return state.items.find((candidate) => candidate.id === id) ?? null
      },
      listComments: async (id) => {
        state.assertAvailable()
        return {
          value: { items: state.comments.get(id) ?? [], hasMore: false },
          cacheStatus: 'bypass',
        }
      },
      listRoadmap: async () => ({
        value: { items: [roadmap], hasMore: false },
        cacheStatus: 'bypass',
      }),
      listChangelog: async () => {
        state.assertAvailable()
        return {
          value: { items: [changelog], hasMore: false },
          cacheStatus: 'bypass',
        }
      },
      listChangelogForFeedback: async (id) => ({
        value: {
          items: changelog.linkedFeedbackItemIds.includes(id)
            ? [changelog]
            : [],
          hasMore: false,
        },
        cacheStatus: 'bypass',
      }),
      getChangelogEntry: async (slug) => {
        state.assertAvailable()
        return slug === changelog.slug ? changelog : null
      },
    },
    mutations: {
      submit: async (input, author) => {
        state.assertAvailable()
        state.sequence += 1
        const created = PublicFeedbackItemSchema.parse({
          id: `submitted-${state.sequence}`,
          title: input.title,
          description: input.description,
          type: input.type,
          author,
          status: status.open,
          category: input.categoryId
            ? { id: input.categoryId, name: 'Feature', order: 0 }
            : null,
          tags: [],
          voteCount: 0,
          commentCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        state.items.unshift(created)
        return created
      },
      setVote: async (userId, input) => {
        state.assertAvailable()
        const voters =
          state.votes.get(input.feedbackItemId) ?? new Set<string>()
        if (input.voted) voters.add(userId)
        else voters.delete(userId)
        state.votes.set(input.feedbackItemId, voters)
        const candidate = state.items.find(
          ({ id }) => id === input.feedbackItemId,
        )
        if (!candidate) throw new Error('Feedback was not found.')
        const base =
          input.feedbackItemId === 'feedback-offline'
            ? 8
            : input.feedbackItemId === 'feedback-export'
              ? 4
              : input.feedbackItemId === 'feedback-changelog'
                ? 12
                : 0
        candidate.voteCount = base + voters.size
        return SetVoteResultSchema.parse({
          feedbackItemId: input.feedbackItemId,
          voted: voters.has(userId),
          voteCount: candidate.voteCount,
        })
      },
      voteStates: async (userId, ids) =>
        ids.map((feedbackItemId) => ({
          feedbackItemId: feedbackItemId as PublicFeedbackItem['id'],
          voted: state.votes.get(feedbackItemId)?.has(userId) ?? false,
        })),
      createComment: async (author, authorKind, input) => {
        state.assertAvailable()
        const existing = state.comments.get(input.feedbackItemId) ?? []
        const duplicate = existing.find(
          (comment) => comment.id === input.clientRequestId,
        )
        if (duplicate) return duplicate
        const comment: PublicComment = {
          id: input.clientRequestId as PublicComment['id'],
          feedbackItemId: input.feedbackItemId,
          body: input.body,
          author,
          authorKind,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        existing.push(comment)
        state.comments.set(input.feedbackItemId, existing)
        const candidate = state.items.find(
          ({ id }) => id === input.feedbackItemId,
        )
        if (candidate) candidate.commentCount = existing.length
        return comment
      },
      setSubscription: async () =>
        unsupportedConnectorOperation('mock', 'setSubscription'),
    },
  }
}

export const mockConnectorRuntime = runtime()
export const resetMockConnector = () => state.reset()
export const setMockConnectorFailure = (failed: boolean) => {
  state.failed = failed
}
