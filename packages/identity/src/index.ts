import { Context, Effect, Schema } from 'effect'
import { IdentityRequired, type StorageUnavailable } from '@feedbax/contracts'
import {
  PrivateIdentity,
  VisitorIdentityId,
  type PrivateIdentity as PrivateIdentityType,
} from '@feedbax/domain'
import { InteractionStore } from '@feedbax/storage'

export type IdentityMode = 'anonymous' | 'email' | 'handoff'
export interface IdentityRequest {
  readonly headers: Headers
  readonly url: URL
}
export interface IdentityResolution {
  readonly identity: PrivateIdentity
  readonly setCookie?: string
}
export interface IdentityProviderService {
  readonly mode: IdentityMode
  readonly resolve: (
    request: IdentityRequest,
  ) => Effect.Effect<
    IdentityResolution | undefined,
    IdentityRequired | StorageUnavailable,
    InteractionStore
  >
  readonly forget: (request: IdentityRequest) => Effect.Effect<string>
}
export class IdentityProvider extends Context.Tag('@feedbax/IdentityProvider')<
  IdentityProvider,
  IdentityProviderService
>() {}

export const cookieAttributes = (production: boolean, maxAgeSeconds: number) =>
  `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}`

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

const cookieName = '__Host-feedbax_session'
const encoder = new TextEncoder()
const toBase64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
const fromBase64Url = (value: string) => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export interface SessionCodec {
  readonly encode: (subject: string) => Effect.Effect<string, IdentityRequired>
  readonly decode: (
    value: string,
  ) => Effect.Effect<string | undefined, IdentityRequired>
}

export const makeSessionCodec = (secret: string): SessionCodec => {
  if (encoder.encode(secret).byteLength < 32)
    throw new Error('FEEDBAX_SESSION_SECRET must contain at least 32 bytes.')
  const key = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return {
    encode: (subject) =>
      Effect.tryPromise({
        try: async () => {
          const payload = toBase64Url(encoder.encode(`v1:${subject}`))
          const signature = await crypto.subtle.sign(
            'HMAC',
            await key,
            encoder.encode(payload),
          )
          return `${payload}.${toBase64Url(new Uint8Array(signature))}`
        },
        catch: () =>
          new IdentityRequired({ message: 'Identity could not be created.' }),
      }),
    decode: (value) =>
      Effect.tryPromise({
        try: async () => {
          const [payload, signature] = value.split('.')
          if (!payload || !signature) return undefined
          const valid = await crypto.subtle.verify(
            'HMAC',
            await key,
            fromBase64Url(signature),
            encoder.encode(payload),
          )
          if (!valid) return undefined
          const decoded = new TextDecoder().decode(fromBase64Url(payload))
          return decoded.startsWith('v1:') ? decoded.slice(3) : undefined
        },
        catch: () =>
          new IdentityRequired({ message: 'Identity could not be verified.' }),
      }),
  }
}

const cookieValue = (headers: Headers) => {
  const match = headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}
const identityId = (subject: string) =>
  Schema.decodeUnknownSync(VisitorIdentityId)(`identity_${subject}`)
const identity = (
  subject: string,
  kind: IdentityMode,
  displayName: string,
  email?: string,
): PrivateIdentityType =>
  Schema.decodeUnknownSync(PrivateIdentity)({
    id: identityId(subject),
    subject,
    kind,
    displayName,
    ...(email ? { email } : {}),
  })

export const makeAnonymousProvider = (
  codec: SessionCodec,
  production: boolean,
): IdentityProviderService => ({
  mode: 'anonymous',
  resolve: ({ headers }) =>
    Effect.gen(function* () {
      const encoded = cookieValue(headers)
      const existingSubject = encoded ? yield* codec.decode(encoded) : undefined
      const subject = existingSubject ?? crypto.randomUUID()
      const value = identity(subject, 'anonymous', 'Anonymous')
      const store = yield* InteractionStore
      if (!existingSubject) yield* store.saveIdentity(value)
      const session = existingSubject ? undefined : yield* codec.encode(subject)
      return {
        identity: value,
        ...(session
          ? {
              setCookie: `${cookieName}=${encodeURIComponent(session)}; ${cookieAttributes(production, 60 * 60 * 24 * 365)}`,
            }
          : {}),
      }
    }),
  forget: () =>
    Effect.succeed(`${cookieName}=; ${cookieAttributes(production, 0)}`),
})

export const makeEmailProvider = (
  codec: SessionCodec,
  production: boolean,
): IdentityProviderService => ({
  mode: 'email',
  resolve: ({ headers }) =>
    Effect.gen(function* () {
      const encoded = cookieValue(headers)
      if (!encoded) return undefined
      const subject = yield* codec.decode(encoded)
      if (!subject) return undefined
      const store = yield* InteractionStore
      const value = yield* store.findIdentity(identityId(subject))
      return value ? { identity: value } : undefined
    }),
  forget: () =>
    Effect.succeed(`${cookieName}=; ${cookieAttributes(production, 0)}`),
})

export const rememberEmail = (
  codec: SessionCodec,
  email: string,
  production: boolean,
) =>
  Effect.gen(function* () {
    const normalized = normalizeEmail(email)
    if (!/^\S+@\S+\.\S+$/.test(normalized))
      return yield* new IdentityRequired({ message: 'Enter a valid email.' })
    const subject = crypto.randomUUID()
    const value = identity(subject, 'email', 'Customer', normalized)
    const store = yield* InteractionStore
    yield* store.saveIdentity(value)
    const session = yield* codec.encode(subject)
    return {
      identity: value,
      setCookie: `${cookieName}=${encodeURIComponent(session)}; ${cookieAttributes(production, 60 * 60 * 24 * 30)}`,
    }
  })

export const rejectDeferredIdentityMode = (mode: string): IdentityMode => {
  if (mode === 'anonymous' || mode === 'email' || mode === 'handoff')
    return mode
  throw new Error(`Identity mode "${mode}" is not supported in Feedbax 0.1.0.`)
}
