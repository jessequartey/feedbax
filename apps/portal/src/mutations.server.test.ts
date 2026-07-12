import { describe, expect, it } from 'vitest'
import type { AuthSession, IdentityProvider } from '@feedbax/auth'
import {
  protectMutation,
  mutationSchemas,
  MemoryRateLimitStore,
  type MutationDependencies,
  type SecurityEvent,
} from './mutations.server.js'

const session = {
  user: {
    id: 'usr_test',
    identitySubject: 'subject',
    email: 'a@example.com',
    displayName: 'Ada',
  },
  issuer: 'test',
  authenticatedAt: new Date(),
  expiresAt: new Date(Date.now() + 10000),
} as AuthSession
function dependencies(authenticated = true) {
  const events: SecurityEvent[] = []
  const auth: IdentityProvider = {
    id: 'test',
    currentSession: async () => (authenticated ? session : null),
    requireAuthentication: async () => {
      if (!authenticated) throw new Error('missing')
      return session
    },
    publicUser: () => ({ id: session.user.id, displayName: 'Ada' }),
    loginRedirect: async (_request, path) =>
      new Response(null, {
        status: 303,
        headers: {
          location: `https://login.example/?return=${encodeURIComponent(path ?? '/')}`,
        },
      }),
    logout: async () =>
      new Response(null, { status: 303, headers: { location: '/' } }),
  }
  const service = {
    submit: async (_s: AuthSession, input: unknown) => input,
    setVote: async (_s: AuthSession, input: unknown) => input,
    createComment: async (_s: AuthSession, input: unknown) => input,
    setSubscription: async (_s: AuthSession, input: unknown) => input,
  }
  const deps: MutationDependencies = {
    auth,
    service,
    rateLimits: new MemoryRateLimitStore(),
    logger: {
      log: (event) => {
        events.push(event)
      },
    },
    config: {
      maximumBodyBytes: 1000,
      actions: {
        submit: { limit: 1, windowSeconds: 60 },
        vote: { limit: 1, windowSeconds: 60 },
        comment: { limit: 1, windowSeconds: 60 },
        subscribe: { limit: 1, windowSeconds: 60 },
      },
    },
  }
  return { deps, events }
}
function request(body: unknown, extra: Record<string, string> = {}) {
  return new Request('https://board.example/api/vote', {
    method: 'POST',
    headers: {
      origin: 'https://board.example',
      'content-type': 'application/json',
      ...extra,
    },
    body: JSON.stringify(body),
  })
}
describe('protected mutations', () => {
  it('requires identity and preserves the intended return path', async () => {
    const { deps } = dependencies(false)
    const response = await protectMutation(
      request(
        { input: { feedbackItemId: 'one', voted: true } },
        { 'x-feedbax-return-path': '/feedback/one?sort=new#vote' },
      ),
      'vote',
      mutationSchemas.vote,
      () => Promise.resolve(null),
      deps,
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        loginLocation: expect.stringContaining(
          encodeURIComponent('/feedback/one?sort=new#vote'),
        ),
      },
    })
  })
  it('rejects forged fields and repeated requests', async () => {
    const { deps } = dependencies()
    const forged = await protectMutation(
      request({
        input: {
          feedbackItemId: 'one',
          voted: true,
          userId: 'forged',
          voteCount: 999,
        },
      }),
      'vote',
      mutationSchemas.vote,
      () => Promise.resolve(null),
      deps,
    )
    expect(forged.status).toBe(422)
    const good = () =>
      protectMutation(
        request({ input: { feedbackItemId: 'one', voted: true } }),
        'vote',
        mutationSchemas.vote,
        () => Promise.resolve({ voteCount: 1 }),
        deps,
      )
    expect((await good()).status).toBe(200)
    expect((await good()).status).toBe(429)
  })
  it('rejects missing origins, wrong content types, and malformed JSON', async () => {
    const { deps } = dependencies()
    const noOrigin = new Request('https://board.example/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(
      (
        await protectMutation(
          noOrigin,
          'vote',
          mutationSchemas.vote,
          () => Promise.resolve(null),
          deps,
        )
      ).status,
    ).toBe(403)
  })
})
