import {
  PublicUserSchema,
  UserIdSchema,
  type PublicUser,
  type UserId,
} from '@feedbax/core'
import {
  EncryptJWT,
  base64url,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtDecrypt,
  jwtVerify,
  type JWTPayload,
} from 'jose'

export const SESSION_COOKIE_NAME = '__Host-feedbax_session'

export interface AuthUser {
  readonly id: UserId
  readonly identitySubject: string
  readonly email: string
  readonly displayName: string
  readonly avatarUrl?: string
}

export interface AuthSession {
  readonly user: AuthUser
  readonly issuer: string
  readonly authenticatedAt: Date
  readonly expiresAt: Date
  readonly company?: string
  readonly role?: string
  readonly plan?: string
}

export type AuthenticationErrorCode = 'missing' | 'invalid' | 'expired'

export class AuthenticationError extends Error {
  readonly name = 'AuthenticationError'
  constructor(readonly code: AuthenticationErrorCode) {
    super(
      code === 'missing'
        ? 'Authentication is required.'
        : 'Authentication could not be verified.',
    )
  }
}

export interface IdentityProvider {
  readonly id: string
  currentSession(request: Request): Promise<AuthSession | null>
  requireAuthentication(request: Request): Promise<AuthSession>
  publicUser(session: AuthSession): PublicUser
  loginRedirect(request: Request, returnPath?: string): Promise<Response>
  logout(request: Request, returnPath?: string): Promise<Response>
}

export interface SigningKeyConfig {
  readonly id: string
  /** Base64url-encoded secret containing at least 32 random bytes. */
  readonly secret: string
}

export interface HandoffIssuerConfig {
  readonly issuer: string
  readonly keys: readonly SigningKeyConfig[]
}

export interface SignedHandoffConfig {
  readonly audience: string
  readonly issuers: readonly HandoffIssuerConfig[]
  readonly sessionKeys: readonly SigningKeyConfig[]
  readonly activeSessionKeyId: string
  readonly loginUrl: string
  readonly handoffPath?: string
  readonly sessionLifetimeSeconds?: number
  readonly maximumHandoffLifetimeSeconds?: number
  readonly clockToleranceSeconds?: number
}

interface SessionClaims extends JWTPayload {
  v: 1
  uid: string
  email: string
  name: string
  picture?: string
  company?: string
  role?: string
  plan?: string
}

const textEncoder = new TextEncoder()
const defaultHandoffPath = '/auth/handoff'
const defaultSessionLifetime = 60 * 60 * 24 * 7
const defaultMaximumHandoffLifetime = 5 * 60
const defaultClockTolerance = 30

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalNonEmpty(value: unknown): string | undefined {
  return nonEmpty(value) ? value.trim() : undefined
}

function validAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function hasUnsafePathCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127 || character === '\\') return true
  }
  return false
}

function secretKey(key: SigningKeyConfig): Uint8Array {
  const decoded = base64url.decode(key.secret)
  if (decoded.byteLength < 32)
    throw new Error(
      `Authentication key ${key.id} must contain at least 32 bytes.`,
    )
  return decoded
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (hasUnsafePathCharacter(value)) return '/'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || hasUnsafePathCharacter(decoded)) return '/'
    const parsed = new URL(value, 'https://feedbax.invalid')
    if (parsed.origin !== 'https://feedbax.invalid') return '/'
    if (
      parsed.pathname === '/auth/handoff' ||
      parsed.pathname === '/auth/logout'
    )
      return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

export async function stableUserId(
  issuer: string,
  subject: string,
): Promise<UserId> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`${issuer}\0${subject}`),
  )
  return UserIdSchema.parse(`usr_${base64url.encode(new Uint8Array(digest))}`)
}

function cookieValue(request: Request): string | undefined {
  const escaped = SESSION_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = request.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({
    location,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  if (cookie) headers.set('set-cookie', cookie)
  return new Response(null, { status: 303, headers })
}

function authenticationCode(error: unknown): AuthenticationErrorCode {
  return error instanceof joseErrors.JWTExpired ? 'expired' : 'invalid'
}

export class SignedHandoffIdentityProvider implements IdentityProvider {
  readonly id = 'signed-handoff'
  private readonly issuers: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>
  private readonly sessionKeys: ReadonlyMap<string, Uint8Array>
  private readonly activeSessionKey: Uint8Array
  private readonly handoffPath: string
  private readonly sessionLifetime: number
  private readonly maximumHandoffLifetime: number
  private readonly clockTolerance: number
  private readonly loginUrl: URL

  constructor(private readonly config: SignedHandoffConfig) {
    this.issuers = new Map(
      config.issuers.map(({ issuer, keys }) => [
        issuer,
        new Map(keys.map((key) => [key.id, secretKey(key)])),
      ]),
    )
    this.sessionKeys = new Map(
      config.sessionKeys.map((key) => [key.id, secretKey(key)]),
    )
    const active = this.sessionKeys.get(config.activeSessionKeyId)
    if (!active) throw new Error('The active session key ID is not configured.')
    this.activeSessionKey = active
    this.loginUrl = new URL(config.loginUrl)
    if (
      this.loginUrl.protocol !== 'https:' &&
      this.loginUrl.protocol !== 'http:'
    )
      throw new Error('The login URL must use HTTP or HTTPS.')
    const handoffPath = config.handoffPath ?? defaultHandoffPath
    if (
      !handoffPath.startsWith('/') ||
      handoffPath.startsWith('//') ||
      hasUnsafePathCharacter(handoffPath) ||
      handoffPath.includes('?') ||
      handoffPath.includes('#')
    )
      throw new Error('The handoff path is invalid.')
    this.handoffPath = handoffPath
    this.sessionLifetime =
      config.sessionLifetimeSeconds ?? defaultSessionLifetime
    this.maximumHandoffLifetime =
      config.maximumHandoffLifetimeSeconds ?? defaultMaximumHandoffLifetime
    this.clockTolerance = config.clockToleranceSeconds ?? defaultClockTolerance
  }

  async exchange(token: string): Promise<{
    readonly session: AuthSession
    readonly cookie: string
    readonly returnPath: string
  }> {
    try {
      const header = decodeProtectedHeader(token)
      if (header.alg !== 'HS256' || !nonEmpty(header.kid))
        throw new AuthenticationError('invalid')
      const unverifiedPayload = JSON.parse(
        new TextDecoder().decode(base64url.decode(token.split('.')[1] ?? '')),
      ) as JWTPayload
      if (!nonEmpty(unverifiedPayload.iss))
        throw new AuthenticationError('invalid')
      const key = this.issuers.get(unverifiedPayload.iss)?.get(header.kid)
      if (!key) throw new AuthenticationError('invalid')
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer: unverifiedPayload.iss,
        audience: this.config.audience,
        clockTolerance: this.clockTolerance,
      })
      if (
        !nonEmpty(payload.sub) ||
        !nonEmpty(payload.email) ||
        !nonEmpty(payload.name) ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      )
        throw new AuthenticationError('invalid')
      if (
        payload.exp - payload.iat > this.maximumHandoffLifetime ||
        payload.iat > Math.floor(Date.now() / 1000) + this.clockTolerance
      )
        throw new AuthenticationError('invalid')
      if (
        payload.picture !== undefined &&
        (!nonEmpty(payload.picture) || !validAbsoluteUrl(payload.picture))
      )
        throw new AuthenticationError('invalid')
      const picture = optionalNonEmpty(payload.picture)
      const company = optionalNonEmpty(payload.company)
      const role = optionalNonEmpty(payload.role)
      const plan = optionalNonEmpty(payload.plan)
      const authenticatedAt = new Date()
      const session: AuthSession = {
        user: {
          id: await stableUserId(payload.iss!, payload.sub),
          identitySubject: payload.sub,
          email: payload.email.trim(),
          displayName: payload.name.trim(),
          ...(picture ? { avatarUrl: picture } : {}),
        },
        issuer: payload.iss!,
        authenticatedAt,
        expiresAt: new Date(
          authenticatedAt.getTime() + this.sessionLifetime * 1000,
        ),
        ...(company ? { company } : {}),
        ...(role ? { role } : {}),
        ...(plan ? { plan } : {}),
      }
      return {
        session,
        cookie: sessionCookie(
          await this.encryptSession(session),
          this.sessionLifetime,
        ),
        returnPath: safeReturnPath(optionalNonEmpty(payload.return_path)),
      }
    } catch (error) {
      if (error instanceof AuthenticationError) throw error
      throw new AuthenticationError(authenticationCode(error))
    }
  }

  async currentSession(request: Request): Promise<AuthSession | null> {
    const value = cookieValue(request)
    if (!value) return null
    try {
      const header = decodeProtectedHeader(value)
      if (
        header.alg !== 'dir' ||
        header.enc !== 'A256GCM' ||
        !nonEmpty(header.kid)
      )
        return null
      const key = this.sessionKeys.get(header.kid)
      if (!key) return null
      const { payload } = await jwtDecrypt(value, key, {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
        clockTolerance: this.clockTolerance,
      })
      if (
        payload.v !== 1 ||
        !nonEmpty(payload.iss) ||
        !nonEmpty(payload.sub) ||
        !nonEmpty(payload.uid) ||
        !nonEmpty(payload.email) ||
        !nonEmpty(payload.name) ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      )
        return null
      const expectedId = await stableUserId(payload.iss, payload.sub)
      if (payload.uid !== expectedId) return null
      const picture = optionalNonEmpty(payload.picture)
      const company = optionalNonEmpty(payload.company)
      const role = optionalNonEmpty(payload.role)
      const plan = optionalNonEmpty(payload.plan)
      return {
        user: {
          id: expectedId,
          identitySubject: payload.sub,
          email: payload.email,
          displayName: payload.name,
          ...(picture ? { avatarUrl: picture } : {}),
        },
        issuer: payload.iss,
        authenticatedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        ...(company ? { company } : {}),
        ...(role ? { role } : {}),
        ...(plan ? { plan } : {}),
      }
    } catch {
      return null
    }
  }

  async requireAuthentication(request: Request): Promise<AuthSession> {
    const session = await this.currentSession(request)
    if (!session) throw new AuthenticationError('missing')
    return session
  }

  publicUser(session: AuthSession): PublicUser {
    return PublicUserSchema.parse({
      id: session.user.id,
      displayName: session.user.displayName,
      ...(session.user.avatarUrl ? { avatarUrl: session.user.avatarUrl } : {}),
    })
  }

  async loginRedirect(
    request: Request,
    returnPath?: string,
  ): Promise<Response> {
    const handoff = new URL(this.handoffPath, request.url)
    handoff.searchParams.set('return_path', safeReturnPath(returnPath))
    const destination = new URL(this.loginUrl)
    destination.searchParams.set('return_to', handoff.toString())
    return redirect(destination.toString())
  }

  async logout(_request: Request, returnPath?: string): Promise<Response> {
    return redirect(safeReturnPath(returnPath), sessionCookie('', 0))
  }

  private async encryptSession(session: AuthSession): Promise<string> {
    const claims: SessionClaims = {
      v: 1,
      iss: session.issuer,
      sub: session.user.identitySubject,
      uid: session.user.id,
      email: session.user.email,
      name: session.user.displayName,
      ...(session.user.avatarUrl ? { picture: session.user.avatarUrl } : {}),
      ...(session.company ? { company: session.company } : {}),
      ...(session.role ? { role: session.role } : {}),
      ...(session.plan ? { plan: session.plan } : {}),
    }
    return new EncryptJWT(claims)
      .setProtectedHeader({
        alg: 'dir',
        enc: 'A256GCM',
        kid: this.config.activeSessionKeyId,
      })
      .setIssuedAt(Math.floor(session.authenticatedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(session.expiresAt.getTime() / 1000))
      .encrypt(this.activeSessionKey)
  }
}
