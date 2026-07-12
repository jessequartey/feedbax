import { createFileRoute } from '@tanstack/react-router'
import { mutationHandler } from '../mutations.server.js'
export const Route = createFileRoute('/api/vote')({
  server: { handlers: { POST: mutationHandler('vote') } },
})
