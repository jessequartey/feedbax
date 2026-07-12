import { AuthenticationError } from '@feedbax/auth'
import { createFileRoute } from '@tanstack/react-router'
import { authProvider } from '../auth.server.js'
import { json, publicError } from '../spike.js'

export const Route = createFileRoute('/api/auth-session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = authProvider()
        const session = await auth.currentSession(request)
        return json(
          { user: session ? auth.publicUser(session) : null },
          { headers: { 'cache-control': 'private, no-store' } },
        )
      },
      POST: async ({ request }) => {
        try {
          const auth = authProvider()
          const session = await auth.requireAuthentication(request)
          return json(
            { ok: true, user: auth.publicUser(session) },
            { headers: { 'cache-control': 'private, no-store' } },
          )
        } catch (error) {
          if (error instanceof AuthenticationError)
            return publicError(
              401,
              'AUTHENTICATION_REQUIRED',
              'Authentication is required.',
            )
          return publicError(
            500,
            'AUTHENTICATION_UNAVAILABLE',
            'Authentication is temporarily unavailable.',
          )
        }
      },
    },
  },
})
