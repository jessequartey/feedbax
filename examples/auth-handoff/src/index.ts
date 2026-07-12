import { SignJWT, base64url } from 'jose'

export interface HostUser {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly avatarUrl?: string
  readonly company?: string
  readonly role?: string
  readonly plan?: string
}

export interface IssueHandoffOptions {
  readonly user: HostUser
  readonly issuer: string
  readonly audience: string
  readonly keyId: string
  /** Base64url-encoded secret shared with Feedbax. */
  readonly secret: string
  readonly returnPath?: string
  readonly now?: Date
}

export async function issueHandoffToken(
  options: IssueHandoffOptions,
): Promise<string> {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000)
  return new SignJWT({
    email: options.user.email,
    name: options.user.displayName,
    ...(options.user.avatarUrl ? { picture: options.user.avatarUrl } : {}),
    ...(options.user.company ? { company: options.user.company } : {}),
    ...(options.user.role ? { role: options.user.role } : {}),
    ...(options.user.plan ? { plan: options.user.plan } : {}),
    ...(options.returnPath ? { return_path: options.returnPath } : {}),
  })
    .setProtectedHeader({ alg: 'HS256', kid: options.keyId })
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setSubject(options.user.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 120)
    .sign(base64url.decode(options.secret))
}

export function feedbaxHandoffUrl(
  feedbaxOrigin: string,
  token: string,
): string {
  const url = new URL('/auth/handoff', feedbaxOrigin)
  url.searchParams.set('token', token)
  return url.toString()
}
