import { createFileRoute } from '@tanstack/react-router'
import { changelogListResponse } from '../public-content.server.js'

export const Route = createFileRoute('/api/changelog')({
  server: {
    handlers: { GET: ({ request }) => changelogListResponse(request) },
  },
})
