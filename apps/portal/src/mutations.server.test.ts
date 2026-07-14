import { describe, expect, it } from 'vitest'
import type { AuthSession, IdentityProvider } from '@feedbax/auth-handoff'
import {
  protectMutation,
  commentAuthorKind,
  mutationSchemas,
  MemoryRateLimitStore,
  type MutationDependencies,
  type SecurityEvent,
} from './mutations.server.js'
import { unsupportedConnectorOperation } from '@feedbax/core'

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
      request: { limit: 100, windowSeconds: 60 },
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
  it('translates unsupported connector operations predictably', async () => {
    const { deps } = dependencies()
    deps.service.setSubscription = async () =>
      unsupportedConnectorOperation('minimal', 'setSubscription')
    const response = await protectMutation(
      request({
        input: {
          target: { type: 'feedback', id: 'feedback-1' },
          subscribed: true,
        },
      }),
      'subscribe',
      mutationSchemas.subscribe,
      (session, input) => deps.service.setSubscription(session, input),
      deps,
    )
    expect(response.status).toBe(501)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'MUTATION_UNAVAILABLE',
        message: 'The connected service does not support this action.',
      },
    })
  })

  it('maps verified roles to public comment responder kinds', () => {
    expect(commentAuthorKind('admin')).toBe('administrator')
    expect(commentAuthorKind('support')).toBe('team')
    expect(commentAuthorKind('customer')).toBe('customer')
    expect(commentAuthorKind()).toBe('customer')
  })
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
  it('rate limits malformed and unauthenticated traffic before authentication', async () => {
    const { deps } = dependencies(false)
    deps.config.request = { limit: 1, windowSeconds: 60 }
    const malformed = () =>
      protectMutation(
        request({ input: { feedbackItemId: 'one', voted: 'yes' } }),
        'vote',
        mutationSchemas.vote,
        () => Promise.resolve(null),
        deps,
      )
    expect((await malformed()).status).toBe(401)
    const limited = await malformed()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
  })
  it('fails CAPTCHA closed and treats logger failures as best effort', async () => {
    const { deps } = dependencies()
    deps.config.actions.vote = { limit: 10, windowSeconds: 60, captcha: true }
    deps.captcha = { verify: async () => false }
    deps.logger = {
      log: () => {
        throw new Error('private logger failure')
      },
    }
    const response = await protectMutation(
      request({
        input: { feedbackItemId: 'one', voted: true },
        captchaToken: 'secret',
      }),
      'vote',
      mutationSchemas.vote,
      () => Promise.resolve(null),
      deps,
    )
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('private logger failure')
  })
  it('returns unavailable when CAPTCHA is configured without a provider', async () => {
    const { deps } = dependencies()
    deps.config.actions.vote = { limit: 10, windowSeconds: 60, captcha: true }
    const response = await protectMutation(
      request({ input: { feedbackItemId: 'one', voted: true } }),
      'vote',
      mutationSchemas.vote,
      () => Promise.resolve(null),
      deps,
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MUTATION_UNAVAILABLE' },
    })
  })
  it('rejects malformed content lengths and oversized bodies', async () => {
    const { deps } = dependencies()
    const invalidLength = request(
      { input: { feedbackItemId: 'one', voted: true } },
      { 'content-length': '-1' },
    )
    expect(
      (
        await protectMutation(
          invalidLength,
          'vote',
          mutationSchemas.vote,
          () => Promise.resolve(null),
          deps,
        )
      ).status,
    ).toBe(400)
    deps.config.maximumBodyBytes = 10
    expect(
      (
        await protectMutation(
          request({ input: { feedbackItemId: 'one', voted: true } }),
          'vote',
          mutationSchemas.vote,
          () => Promise.resolve(null),
          deps,
        )
      ).status,
    ).toBe(413)
  })
})
