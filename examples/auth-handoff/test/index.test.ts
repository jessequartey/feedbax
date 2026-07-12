import { base64url, decodeJwt, decodeProtectedHeader } from 'jose'
import { describe, expect, it } from 'vitest'
import { feedbaxHandoffUrl, issueHandoffToken } from '../src/index.js'

describe('host handoff example', () => {
  it('issues a short-lived token with a stable subject and key ID', async () => {
    const secret = base64url.encode(new Uint8Array(32).fill(4))
    const token = await issueHandoffToken({
      user: {
        id: 'customer-42',
        email: 'ada@example.com',
        displayName: 'Ada',
        plan: 'pro',
      },
      issuer: 'https://app.example.com',
      audience: 'feedbax',
      keyId: '2026-07',
      secret,
      returnPath: '/feedback',
      now: new Date('2026-07-12T00:00:00Z'),
    })
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: 'HS256',
      kid: '2026-07',
    })
    expect(decodeJwt(token)).toMatchObject({
      sub: 'customer-42',
      email: 'ada@example.com',
      return_path: '/feedback',
      exp: 1783814520,
    })
    expect(feedbaxHandoffUrl('https://feedback.example.com', token)).toContain(
      '/auth/handoff?token=',
    )
  })
})
