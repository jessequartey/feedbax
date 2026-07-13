import 'server-only'

import {
  feedbaxHandoffUrl,
  issueHandoffToken,
  type HostUser,
} from '../../src/index'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing server environment variable: ${name}`)
  return value
}

const feedbaxOrigin = required('FEEDBAX_ORIGIN')

export function acceptedReturnTo(value: string | null): URL {
  const fallback = new URL('/auth/handoff', feedbaxOrigin)
  if (!value) return fallback
  try {
    const candidate = new URL(value)
    return candidate.origin === new URL(feedbaxOrigin).origin &&
      candidate.pathname === '/auth/handoff'
      ? candidate
      : fallback
  } catch {
    return fallback
  }
}

export async function handoffDestination(
  user: HostUser,
  returnTo: URL,
): Promise<string> {
  const token = await issueHandoffToken({
    user,
    issuer: required('FEEDBAX_HANDOFF_ISSUER'),
    audience: required('FEEDBAX_HANDOFF_AUDIENCE'),
    keyId: required('FEEDBAX_HANDOFF_KEY_ID'),
    secret: required('FEEDBAX_HANDOFF_SECRET'),
    returnPath: returnTo.searchParams.get('return_path') ?? '/',
  })
  return feedbaxHandoffUrl(feedbaxOrigin, token)
}

export function feedbaxLogoutUrl(returnPath = '/'): string {
  const url = new URL('/auth/logout', feedbaxOrigin)
  url.searchParams.set('return_path', returnPath)
  return url.toString()
}
