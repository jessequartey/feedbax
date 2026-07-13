import {
  unsupportedConnectorOperation,
  type ConnectorRuntime,
  type PublicFeedbackItem,
} from '@feedbax/core'
import { connectorContract } from '../src/index.js'

function minimalConnector(): ConnectorRuntime {
  const item: PublicFeedbackItem = {
    id: 'fixture-feedback' as PublicFeedbackItem['id'],
    title: 'Synthetic fixture',
    description: 'Connector-independent contract fixture.',
    type: 'feature',
    author: {
      id: 'fixture-author' as PublicFeedbackItem['author']['id'],
      displayName: 'Fixture Author',
    },
    status: null,
    category: null,
    tags: [],
    voteCount: 0,
    commentCount: 0,
    createdAt: '2026-07-13T00:00:00Z',
    updatedAt: '2026-07-13T00:00:00Z',
  }
  const votes = new Set<string>()
  return {
    descriptor: { id: 'minimal', displayName: 'Minimal', capabilities: [] },
    reader: {
      listFeedback: async () => ({
        value: { items: [item], hasMore: false },
        cacheStatus: 'bypass',
      }),
      getFeedback: async (id) => (id === item.id ? item : null),
      listRoadmap: async () => ({
        value: { items: [], hasMore: false },
        cacheStatus: 'bypass',
      }),
      listChangelog: async () => ({
        value: { items: [], hasMore: false },
        cacheStatus: 'bypass',
      }),
      listChangelogForFeedback: async () => ({
        value: { items: [], hasMore: false },
        cacheStatus: 'bypass',
      }),
      getChangelogEntry: async () => null,
      listComments: async () => ({
        value: { items: [], hasMore: false },
        cacheStatus: 'bypass',
      }),
    },
    mutations: {
      submit: async (input, author) => ({
        ...item,
        id: 'submitted-feedback' as PublicFeedbackItem['id'],
        title: input.title,
        description: input.description,
        type: input.type,
        author,
      }),
      setVote: async (userId, input) => {
        const key = `${userId}:${input.feedbackItemId}`
        if (input.voted) votes.add(key)
        else votes.delete(key)
        return {
          feedbackItemId: input.feedbackItemId,
          voted: votes.has(key),
          voteCount: votes.size,
        }
      },
      voteStates: async (userId, ids) =>
        ids.map((feedbackItemId) => ({
          feedbackItemId: feedbackItemId as PublicFeedbackItem['id'],
          voted: votes.has(`${userId}:${feedbackItemId}`),
        })),
      createComment: async () =>
        unsupportedConnectorOperation('minimal', 'createComment'),
      setSubscription: async () =>
        unsupportedConnectorOperation('minimal', 'setSubscription'),
    },
  }
}

connectorContract('minimal', {
  create: minimalConnector,
  feedbackItemId: 'fixture-feedback',
  unsupported: [
    { operation: 'createComment', capability: 'comments' },
    { operation: 'setSubscription', capability: null },
  ],
})
