import { createFileRoute } from '@tanstack/react-router'
import { feedbackSuggestionsResponse } from '../public-feedback.server.js'

export const Route = createFileRoute('/api/feedback/suggestions')({
  server: { handlers: { GET: ({ request }) => feedbackSuggestionsResponse(request) } },
})
