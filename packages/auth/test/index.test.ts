import { PublicUserSchema } from '@feedbax/core'
import { SignJWT, base64url } from 'jose'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  AuthenticationError,
  SESSION_COOKIE_NAME,
  SignedHandoffIdentityProvider,
  safeReturnPath,
  stableUserId,
  type IdentityProvider,
} from '../src/index.js'

const signingSecret = base64url.encode(new Uint8Array(32).fill(7))
const oldSigningSecret = base64url.encode(new Uint8Array(32).fill(8))
const sessionSecret = base64url.encode(new Uint8Array(32).fill(9))
const oldSessionSecret = base64url.encode(new Uint8Array(32).fill(10))

function provider(activeSessionKeyId = 'session-2') {
  return new SignedHandoffIdentityProvider({
    audience: 'feedbax',
    issuers: [
      {
        issuer: 'https://app.example.com',
        keys: [
          { id: 'sign-2', secret: signingSecret },
          { id: 'sign-1', secret: oldSigningSecret },
        ],
      },
      {
        issuer: 'https://other.example.com',
        keys: [{ id: 'sign-2', secret: signingSecret }],
      },
    ],
    sessionKeys: [
      { id: 'session-2', secret: sessionSecret },
      { id: 'session-1', secret: oldSessionSecret },
    ],
    activeSessionKeyId,
    loginUrl: 'https://app.example.com/login',
    sessionLifetimeSeconds: 3600,
    maximumHandoffLifetimeSeconds: 300,
    clockToleranceSeconds: 0,
  })
}

async function token(
  overrides: Record<string, unknown> = {},
  key = signingSecret,
  kid = 'sign-2',
) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    email: 'ada@example.com',
    name: 'Ada',
    picture: 'https://cdn.example.com/ada.png',
    company: 'Example',
    role: 'admin',
    plan: 'pro',
    return_path: '/feedback?sort=new',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256', kid })
    .setIssuer(String(overrides.iss ?? 'https://app.example.com'))
    .setAudience(String(overrides.aud ?? 'feedbax'))
    .setSubject(String(overrides.sub ?? 'customer-42'))
    .setIssuedAt(Number(overrides.iat ?? now))
    .setExpirationTime(Number(overrides.exp ?? now + 120))
    .sign(base64url.decode(key))
}

function requestWithCookie(cookie: string) {
  return new Request('https://feedback.example.com/', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookie)}` },
  })
}

describe('identity boundary', () => {
  it('exposes the complete framework-neutral contract', () => {
    expectTypeOf<IdentityProvider>().toHaveProperty('currentSession')
    expectTypeOf<IdentityProvider>().toHaveProperty('requireAuthentication')
    expectTypeOf<IdentityProvider>().toHaveProperty('publicUser')
    expectTypeOf<IdentityProvider>().toHaveProperty('loginRedirect')
    expectTypeOf<IdentityProvider>().toHaveProperty('logout')
  })

  it('derives stable opaque IDs scoped by issuer and subject', async () => {
    const first = await stableUserId('https://app.example.com', 'customer-42')
    expect(first).toBe(
      await stableUserId('https://app.example.com', 'customer-42'),
    )
    expect(first).not.toContain('customer-42')
    expect(first).not.toBe(
      await stableUserId('https://other.example.com', 'customer-42'),
    )
    expect(first).not.toBe(
      await stableUserId('https://app.example.com', 'customer-43'),
    )
  })

  it('exchanges a valid handoff for an encrypted secure session', async () => {
    const auth = provider()
    const result = await auth.exchange(await token())
    expect(result.returnPath).toBe('/feedback?sort=new')
    expect(result.cookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(result.cookie).toContain('HttpOnly')
    expect(result.cookie).toContain('Secure')
    expect(result.cookie).toContain('SameSite=Lax')
    expect(result.cookie).not.toContain('ada@example.com')
    const cookie = result.cookie.match(
      new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
    )?.[1]
    const session = await auth.currentSession(
      requestWithCookie(decodeURIComponent(cookie!)),
    )
    expect(session?.user.identitySubject).toBe('customer-42')
    expect(session?.company).toBe('Example')
    const projected = auth.publicUser(session!)
    expect(PublicUserSchema.parse(projected)).toEqual(projected)
    expect(projected).not.toHaveProperty('email')
    expect(projected).not.toHaveProperty('identitySubject')
  })

  it('accepts configured issuers and retained signing keys', async () => {
    expect(
      (
        await provider().exchange(
          await token({ iss: 'https://other.example.com' }),
        )
      ).session.issuer,
    ).toBe('https://other.example.com')
    expect(
      (await provider().exchange(await token({}, oldSigningSecret, 'sign-1')))
        .session.user.displayName,
    ).toBe('Ada')
  })

  it.each([
    ['unknown key', () => token({}, signingSecret, 'missing')],
    ['wrong issuer', () => token({ iss: 'https://evil.example.com' })],
    ['wrong audience', () => token({ aud: 'other' })],
    ['missing email', () => token({ email: '' })],
    ['invalid avatar', () => token({ picture: 'javascript:alert(1)' })],
    [
      'future issued at',
      () => token({ iat: Math.floor(Date.now() / 1000) + 100 }),
    ],
    [
      'excessive lifetime',
      () => token({ exp: Math.floor(Date.now() / 1000) + 600 }),
    ],
    [
      'expired',
      () =>
        token({
          iat: Math.floor(Date.now() / 1000) - 200,
          exp: Math.floor(Date.now() / 1000) - 100,
        }),
    ],
  ])('rejects %s safely', async (_label, makeToken) => {
    await expect(provider().exchange(await makeToken())).rejects.toBeInstanceOf(
      AuthenticationError,
    )
  })

  it('rejects token tampering and unsupported algorithms', async () => {
    const signed = await token()
    await expect(
      provider().exchange(`${signed.slice(0, -1)}x`),
    ).rejects.toMatchObject({ code: 'invalid' })
    const none = `${base64url.encode(JSON.stringify({ alg: 'none', kid: 'sign-2' }))}.${base64url.encode('{}')}.`
    await expect(provider().exchange(none)).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('treats missing, tampered, expired, and unknown-key sessions as anonymous', async () => {
    const auth = provider()
    expect(
      await auth.currentSession(new Request('https://feedback.example.com')),
    ).toBeNull()
    expect(await auth.currentSession(requestWithCookie('invalid'))).toBeNull()
    const issuedByOld = await provider('session-1').exchange(await token())
    const oldCookie = decodeURIComponent(
      issuedByOld.cookie.match(
        new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
      )?.[1] ?? '',
    )
    expect(
      await auth.currentSession(requestWithCookie(oldCookie)),
    ).not.toBeNull()
    const noOldKey = new SignedHandoffIdentityProvider({
      audience: 'feedbax',
      issuers: [
        {
          issuer: 'https://app.example.com',
          keys: [{ id: 'sign-2', secret: signingSecret }],
        },
      ],
      sessionKeys: [{ id: 'session-2', secret: sessionSecret }],
      activeSessionKeyId: 'session-2',
      loginUrl: 'https://app.example.com/login',
    })
    expect(
      await noOldKey.currentSession(requestWithCookie(oldCookie)),
    ).toBeNull()
    await expect(
      auth.requireAuthentication(new Request('https://feedback.example.com')),
    ).rejects.toMatchObject({ code: 'missing' })
  })

  it('creates safe login and idempotent logout redirects', async () => {
    const auth = provider()
    const login = await auth.loginRedirect(
      new Request('https://feedback.example.com/'),
      '//evil.example',
    )
    expect(login.status).toBe(303)
    const destination = new URL(login.headers.get('location')!)
    expect(destination.origin).toBe('https://app.example.com')
    expect(
      new URL(destination.searchParams.get('return_to')!).searchParams.get(
        'return_path',
      ),
    ).toBe('/')
    const logout = await auth.logout(
      new Request('https://feedback.example.com/'),
      '/goodbye',
    )
    expect(logout.headers.get('location')).toBe('/goodbye')
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('safeReturnPath', () => {
  it.each([
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil',
    '/%5cevil',
    '/%0aevil',
    '/auth/handoff',
    '/auth/logout',
  ])('rejects %s', (value) => expect(safeReturnPath(value)).toBe('/'))
  it('keeps a local path, query, and fragment', () =>
    expect(safeReturnPath('/feedback?sort=new#item')).toBe(
      '/feedback?sort=new#item',
    ))
})
