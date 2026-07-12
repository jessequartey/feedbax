import { createFileRoute } from '@tanstack/react-router'
import { roadmapListResponse } from '../public-content.server.js'

export const Route = createFileRoute('/api/roadmap')({
  server: { handlers: { GET: ({ request }) => roadmapListResponse(request) } },
})
