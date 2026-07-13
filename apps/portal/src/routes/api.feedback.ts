import { createFileRoute } from '@tanstack/react-router'
import { mutationHandler } from '../mutations.server.js'
import { feedbackListResponse } from '../public-feedback.server.js'
export const Route = createFileRoute('/api/feedback')({
  server: {
    handlers: {
      GET: ({ request }) => feedbackListResponse(request),
      POST: mutationHandler('submit'),
    },
  },
})
