import { createServerFn } from '@tanstack/react-start'
import { envStatus } from './spike.js'

export const getServerStatus = createServerFn({ method: 'GET' }).handler(async () => ({
  primitive: 'server-function' as const,
  generatedAt: new Date().toISOString(),
  environment: envStatus(),
}))
