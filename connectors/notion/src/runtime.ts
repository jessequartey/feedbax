import {
  unsupportedConnectorOperation,
  VoteStateResponseSchema,
  type ConnectorRuntime,
} from '@feedbax/core'
import {
  createNotionMutationService,
  type NotionMutationOptions,
} from './mutations.js'
import {
  createNotionReadClient,
  type NotionReadClientOptions,
} from './reads.js'

export type NotionRuntimeOptions = NotionReadClientOptions &
  NotionMutationOptions

export function createNotionRuntime(
  options: NotionRuntimeOptions,
): ConnectorRuntime {
  const reader = createNotionReadClient(options)
  const mutations = createNotionMutationService(options)
  return {
    descriptor: {
      id: 'notion',
      displayName: 'Notion',
      capabilities: options.setup.comments ? ['comments'] : [],
    },
    reader,
    mutations: {
      submit: mutations.submit,
      setVote: mutations.setVote,
      voteStates: async (userId, feedbackItemIds) =>
        VoteStateResponseSchema.parse({
          items: await mutations.voteStates(userId, feedbackItemIds),
        }).items,
      createComment: options.setup.comments
        ? mutations.createComment
        : async () => unsupportedConnectorOperation('notion', 'createComment'),
      setSubscription: async () =>
        unsupportedConnectorOperation('notion', 'setSubscription'),
    },
  }
}
