import { createFileRoute } from '@tanstack/react-router'
import { feedbackDetailResponse } from '../public-feedback.server.js'

export const Route = createFileRoute('/api/feedback/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) => feedbackDetailResponse(request, params.id),
    },
  },
})
