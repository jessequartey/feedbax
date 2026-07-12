import { createServerFn } from '@tanstack/react-start'
import { envStatus } from './spike.js'
import { publicReader } from './public-feedback.server.js'

export const getServerStatus = createServerFn({ method: 'GET' }).handler(
  async () => ({
    primitive: 'server-function' as const,
    generatedAt: new Date().toISOString(),
    environment: envStatus(),
  }),
)

export const getFeedbackDetail = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const reader = publicReader()
    return reader ? reader.getFeedback(id) : null
  })
