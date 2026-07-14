import { Effect, Layer, ManagedRuntime } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  FeedbackRepository,
  type FeedbackRepositoryService,
} from '@feedbax/connector-sdk'
import { RateLimited } from '@feedbax/contracts'
import {
  listFeedback,
  runAsServerFunction,
  runAsServerRoute,
} from '../src/index.js'

const repository: FeedbackRepositoryService = {
  descriptor: {
    id: 'test',
    displayName: 'Test',
    capabilities: new Set(['feedback.read', 'feedback.search']),
  },
  healthCheck: Effect.succeed({ ok: true, checks: [] }),
  list: () => Effect.succeed({ items: [], nextCursor: null }),
  get: () => Effect.succeed(undefined),
  submit: () => Effect.die('not used'),
}
const runtime = ManagedRuntime.make(
  Layer.succeed(FeedbackRepository, repository),
)

describe('Effect transport adapters', () => {
  it('maps validation failures consistently for server functions and routes', async () => {
    const effect = listFeedback({ limit: 0 })
    const serverFunction = await runAsServerFunction(
      runtime,
      'request-one',
      effect,
    )
    const response = await runAsServerRoute(runtime, 'request-one', effect)
    expect(serverFunction).toMatchObject({
      ok: false,
      error: { _tag: 'ValidationError', requestId: 'request-one' },
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { _tag: 'ValidationError', requestId: 'request-one' },
    })
  })

  it('preserves tagged failures without leaking defects', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const limited = Effect.fail(
      new RateLimited({ message: 'Slow down.', retryAfterSeconds: 5 }),
    )
    await expect(
      runAsServerFunction(runtime, 'request-two', limited),
    ).resolves.toMatchObject({
      error: { _tag: 'RateLimited', retryAfterSeconds: 5 },
    })
    const response = await runAsServerRoute(
      runtime,
      'request-three',
      Effect.die('secret defect'),
    )
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret defect')
    expect(logged).toHaveBeenCalledWith(
      '[request-three] Unhandled defect:',
      expect.stringContaining('secret defect'),
    )
    logged.mockRestore()
  })

  it('reuses one managed runtime across operations', async () => {
    await expect(
      Promise.all([
        runAsServerFunction(runtime, 'a', listFeedback({ limit: 10 })),
        runAsServerFunction(runtime, 'b', listFeedback({ limit: 10 })),
      ]),
    ).resolves.toEqual([
      { ok: true, value: { items: [], nextCursor: null } },
      { ok: true, value: { items: [], nextCursor: null } },
    ])
  })
})
