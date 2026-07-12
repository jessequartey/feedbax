import { createFileRoute } from '@tanstack/react-router'
import { mutationHandler } from '../mutations.server.js'
export const Route = createFileRoute('/api/feedback')({
  server: { handlers: { POST: mutationHandler('submit') } },
})
