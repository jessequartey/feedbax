import { AuthenticationError } from '@feedbax/auth'
import { createFileRoute } from '@tanstack/react-router'
import { applicationErrorResponse } from '../application-errors.server.js'
import { authProvider } from '../auth.server.js'
import { json } from '../spike.js'

export const Route = createFileRoute('/api/auth-session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = authProvider()
          const session = await auth.currentSession(request)
          return json(
            { user: session ? auth.publicUser(session) : null },
            { headers: { 'cache-control': 'private, no-store' } },
          )
        } catch (error) {
          return applicationErrorResponse(request, 'read-session', error, {
            code: 'CONNECTOR_UNAVAILABLE',
            message: 'Authentication is temporarily unavailable.',
            status: 503,
            retryable: true,
            connector: 'authentication',
          })
        }
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
          if (error instanceof AuthenticationError) {
            let loginLocation = '/'
            try {
              const login = await authProvider().loginRedirect(request, '/')
              loginLocation = login.headers.get('location') ?? '/'
            } catch {
              // Configuration diagnostics stay server-side.
            }
            return applicationErrorResponse(request, 'require-session', error, {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication is required.',
              status: 401,
              retryable: false,
              loginLocation,
              connector: 'authentication',
            })
          }
          return applicationErrorResponse(request, 'require-session', error, {
            code: 'CONNECTOR_UNAVAILABLE',
            message: 'Authentication is temporarily unavailable.',
            status: 503,
            retryable: true,
            connector: 'authentication',
          })
        }
      },
    },
  },
})
