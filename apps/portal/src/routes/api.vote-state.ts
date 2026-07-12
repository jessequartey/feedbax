import { VoteStateRequestSchema, VoteStateResponseSchema } from '@feedbax/core'
import { createFileRoute } from '@tanstack/react-router'
import { authProvider } from '../auth.server.js'
import { publicCache, publicNotionSetup } from '../public-feedback.server.js'
import { createNotionMutationService } from '@feedbax/notion'
import { json, publicError, readEnv } from '../spike.js'

export const Route = createFileRoute('/api/vote-state')({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const auth = authProvider()
      const session = await auth.requireAuthentication(request)
      const input = VoteStateRequestSchema.parse(await request.json())
      const token = readEnv('NOTION_TOKEN')
      const interactionHashKey = readEnv('FEEDBAX_INTERACTION_HASH_KEY')
      if (!token || !interactionHashKey || !publicNotionSetup.votes) throw new Error('unavailable')
      const notion = createNotionMutationService({ token, setup: publicNotionSetup, cache: publicCache, interactionHashKey })
      return json(VoteStateResponseSchema.parse({ items: await notion.voteStates(session.user.id, input.feedbackItemIds) }), { headers: { 'cache-control': 'private, no-store' } })
    } catch (error) {
      if (error instanceof Error && (error.name === 'AuthenticationError'))
        return publicError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
      return publicError(503, 'MUTATION_UNAVAILABLE', 'Vote state is temporarily unavailable.')
    }
  } } },
})
