import { createFileRoute } from '@tanstack/react-router'
import { mutationHandler } from '../mutations.server.js'
import { commentListResponse } from '../public-content.server.js'
export const Route = createFileRoute('/api/comment')({
  server: {
    handlers: {
      GET: ({ request }) => commentListResponse(request),
      POST: mutationHandler('comment'),
    },
  },
})
