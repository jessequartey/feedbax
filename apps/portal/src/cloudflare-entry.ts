import { env } from 'cloudflare:workers'
import serverEntry from '@tanstack/react-start/server-entry'
import {
  configureCloudflareRateLimitNamespace,
  FeedbaxRateLimiter,
} from './rate-limit.cloudflare.server.js'

configureCloudflareRateLimitNamespace(env.FEEDBAX_RATE_LIMITER)

export { FeedbaxRateLimiter }
export default serverEntry
