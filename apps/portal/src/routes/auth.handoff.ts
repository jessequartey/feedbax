import {
  AuthenticationError,
  type SignedHandoffIdentityProvider,
} from '@feedbax/auth'
import { createFileRoute } from '@tanstack/react-router'
import { authProvider } from '../auth.server.js'
import { publicError } from '../spike.js'

export const Route = createFileRoute('/auth/handoff')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get('token')
        if (!token)
          return publicError(
            400,
            'INVALID_HANDOFF',
            'The identity handoff is invalid or expired.',
          )
        try {
          const result = await (
            authProvider() as SignedHandoffIdentityProvider
          ).exchange(token)
          return new Response(null, {
            status: 303,
            headers: {
              location: result.returnPath,
              'set-cookie': result.cookie,
              'cache-control': 'no-store',
              'referrer-policy': 'no-referrer',
            },
          })
        } catch (error) {
          if (error instanceof AuthenticationError)
            return publicError(
              400,
              'INVALID_HANDOFF',
              'The identity handoff is invalid or expired.',
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
