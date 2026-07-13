import { createFileRoute } from '@tanstack/react-router'
import { mutationHandler } from '../mutations.server.js'
export const Route = createFileRoute('/api/subscribe')({
  server: { handlers: { POST: mutationHandler('subscribe') } },
})
