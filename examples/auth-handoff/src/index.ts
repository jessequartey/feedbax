import type { IdentityHandoff } from '@feedbax/auth'
export const exampleHandoff = {
  issuer: 'https://app.example.com',
  audience: 'feedbax',
  expiresAt: new Date(0),
  identity: { subject: 'example-user' },
} satisfies IdentityHandoff
