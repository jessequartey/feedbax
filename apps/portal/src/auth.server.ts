import {
  SignedHandoffIdentityProvider,
  type HandoffIssuerConfig,
  type IdentityProvider,
  type SigningKeyConfig,
} from '@feedbax/auth-handoff'
import { SignJWT, base64url } from 'jose'
import { readEnv } from './spike.js'

let instance: IdentityProvider | undefined
let emailExchangeProvider: SignedHandoffIdentityProvider | undefined

function parseArray<T>(name: string): readonly T[] {
  const value = readEnv(name)
  if (!value) throw new Error(`${name} is required for authentication.`)
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error()
    return parsed as readonly T[]
  } catch {
    throw new Error(`${name} must be a JSON array.`)
  }
}

export function authProvider(): IdentityProvider {
  if (instance) return instance
  if (readEnv('FEEDBAX_IDENTITY_MODE') === 'email') {
    const secret = readEnv('FEEDBAX_SESSION_SECRET')
    if (!secret || new TextEncoder().encode(secret).byteLength < 32)
      throw new Error(
        'FEEDBAX_SESSION_SECRET must contain at least 32 bytes for email identity.',
      )
    const keyBytes = new TextEncoder().encode(secret).slice(0, 32)
    const key = {
      id: 'email-2026-07',
      secret: base64url.encode(keyBytes),
    }
    emailExchangeProvider = new SignedHandoffIdentityProvider({
      audience: 'feedbax',
      issuers: [{ issuer: 'feedbax:email', keys: [key] }],
      sessionKeys: [key],
      activeSessionKeyId: key.id,
      loginUrl: `${readEnv('FEEDBAX_PUBLIC_URL') ?? 'http://localhost:3000'}/auth/email`,
    })
    const provider = emailExchangeProvider
    instance = {
      id: 'email',
      currentSession: (request) => provider.currentSession(request),
      requireAuthentication: (request) =>
        provider.requireAuthentication(request),
      publicUser: (session) => provider.publicUser(session),
      loginRedirect: (request, returnPath = '/') => {
        const destination = new URL('/auth/email', request.url)
        destination.searchParams.set('return_path', returnPath)
        return Promise.resolve(
          new Response(null, {
            status: 303,
            headers: {
              location: destination.toString(),
              'cache-control': 'private, no-store',
            },
          }),
        )
      },
      logout: (request, returnPath) => provider.logout(request, returnPath),
    }
    return instance
  }
  const activeSessionKeyId = readEnv('FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID')
  const loginUrl = readEnv('FEEDBAX_AUTH_LOGIN_URL')
  if (!activeSessionKeyId || !loginUrl)
    throw new Error(
      'FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID and FEEDBAX_AUTH_LOGIN_URL are required for authentication.',
    )
  instance = new SignedHandoffIdentityProvider({
    audience: readEnv('FEEDBAX_AUTH_AUDIENCE') ?? 'feedbax',
    issuers: parseArray<HandoffIssuerConfig>('FEEDBAX_AUTH_ISSUERS'),
    sessionKeys: parseArray<SigningKeyConfig>('FEEDBAX_AUTH_SESSION_KEYS'),
    activeSessionKeyId,
    loginUrl,
  })
  return instance
}

export async function createEmailSession(
  email: string,
  returnPath: string,
): Promise<{ cookie: string; returnPath: string }> {
  const normalized = email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(normalized))
    throw new Error('Enter a valid email address.')
  const secret = readEnv('FEEDBAX_SESSION_SECRET')
  if (!secret) throw new Error('Email identity is not configured.')
  const now = Math.floor(Date.now() / 1000)
  const key = new TextEncoder().encode(secret).slice(0, 32)
  const token = await new SignJWT({
    email: normalized,
    name: 'Customer',
    return_path: returnPath,
  })
    .setProtectedHeader({ alg: 'HS256', kid: 'email-2026-07' })
    .setIssuer('feedbax:email')
    .setAudience('feedbax')
    .setSubject(normalized)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key)
  authProvider()
  if (!emailExchangeProvider)
    throw new Error('Email identity is not configured.')
  const exchanged = await emailExchangeProvider.exchange(token)
  return { cookie: exchanged.cookie, returnPath: exchanged.returnPath }
}
