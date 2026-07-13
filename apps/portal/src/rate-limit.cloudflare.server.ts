import type { RateLimitStore } from './mutations.server.js'

type RateEntry = { count: number; resetAt: number }
interface DurableStorage {
  transaction<T>(
    callback: (transaction: DurableStorage) => Promise<T>,
  ): Promise<T>
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}
interface DurableState {
  storage: DurableStorage
}
interface DurableStub {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>
}
interface DurableNamespace {
  idFromName(name: string): unknown
  get(id: unknown): DurableStub
}

let runtimeNamespace: DurableNamespace | undefined

export function configureCloudflareRateLimitNamespace(namespace: unknown) {
  runtimeNamespace = namespace as DurableNamespace
}

export class FeedbaxRateLimiter {
  constructor(private readonly state: DurableState) {}

  async fetch(request: Request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    const body = (await request.json()) as {
      key?: unknown
      limit?: unknown
      windowSeconds?: unknown
    }
    if (
      typeof body.key !== 'string' ||
      !Number.isInteger(body.limit) ||
      Number(body.limit) <= 0 ||
      !Number.isInteger(body.windowSeconds) ||
      Number(body.windowSeconds) <= 0
    )
      return Response.json({ error: 'invalid request' }, { status: 400 })
    const now = Date.now()
    const result = await this.state.storage.transaction(async (transaction) => {
      const previous = await transaction.get<RateEntry>(body.key as string)
      const entry =
        !previous || previous.resetAt <= now
          ? {
              count: 0,
              resetAt: now + Number(body.windowSeconds) * 1000,
            }
          : previous
      entry.count += 1
      await transaction.put(body.key as string, entry)
      return {
        allowed: entry.count <= Number(body.limit),
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      }
    })
    return Response.json(result)
  }
}

export class CloudflareDurableRateLimitStore implements RateLimitStore {
  constructor(private readonly injected?: DurableNamespace) {}

  async consume(key: string, limit: number, windowSeconds: number) {
    const namespace = this.injected ?? runtimeNamespace
    if (!namespace) throw new Error('Durable rate limiting is not configured.')
    const stub = namespace.get(namespace.idFromName('feedbax-mutations'))
    const response = await stub.fetch('https://rate-limiter/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, limit, windowSeconds }),
    })
    if (!response.ok) throw new Error('Durable rate limiting is unavailable.')
    return response.json() as Promise<{
      allowed: boolean
      retryAfterSeconds: number
    }>
  }
}
