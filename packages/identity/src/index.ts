import { Context, Effect } from 'effect'
import type { IdentityRequired } from '@feedbax/contracts'
import type { PrivateIdentity } from '@feedbax/domain'

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
  ) => Effect.Effect<IdentityResolution | undefined, IdentityRequired>
  readonly forget: (request: IdentityRequest) => Effect.Effect<string>
}
export class IdentityProvider extends Context.Tag('@feedbax/IdentityProvider')<
  IdentityProvider,
  IdentityProviderService
>() {}

export const cookieAttributes = (production: boolean, maxAgeSeconds: number) =>
  `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}`

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const rejectDeferredIdentityMode = (mode: string): IdentityMode => {
  if (mode === 'anonymous' || mode === 'email' || mode === 'handoff')
    return mode
  throw new Error(`Identity mode "${mode}" is not supported in Feedbax 0.1.0.`)
}
