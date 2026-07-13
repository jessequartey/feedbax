import { createFileRoute } from '@tanstack/react-router'
import { authProvider } from '../auth.server.js'

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      POST: ({ request }) =>
        authProvider().logout(
          request,
          new URL(request.url).searchParams.get('return_path') ?? undefined,
        ),
    },
  },
})
