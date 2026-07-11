export interface HandoffIdentity {
  readonly subject: string
  readonly displayName?: string
  readonly avatarUrl?: string
}
export interface IdentityHandoff {
  readonly issuer: string
  readonly audience: string
  readonly expiresAt: Date
  readonly identity: HandoffIdentity
}
export interface IdentityProvider {
  readonly id: string
  verify(token: string): Promise<IdentityHandoff>
}
