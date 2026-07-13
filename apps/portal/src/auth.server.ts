import {
  SignedHandoffIdentityProvider,
  type HandoffIssuerConfig,
  type IdentityProvider,
  type SigningKeyConfig,
} from '@feedbax/auth'
import { readEnv } from './spike.js'

let instance: IdentityProvider | undefined

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
