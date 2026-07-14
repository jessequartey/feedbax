import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { inMemoryInteractionLayer } from '@feedbax/testing'
import {
  makeAnonymousProvider,
  makeEmailProvider,
  makeSessionCodec,
  rememberEmail,
} from '../src/index.js'

const secret = 'feedbax-test-secret-with-at-least-thirty-two-bytes'

describe('visitor identity', () => {
  it('rejects tampered opaque sessions', async () => {
    const codec = makeSessionCodec(secret)
    const encoded = await Effect.runPromise(codec.encode('subject'))
    await expect(
      Effect.runPromise(codec.decode(`${encoded.slice(0, -1)}x`)),
    ).resolves.toBeUndefined()
  })

  it('issues an opaque anonymous cookie', async () => {
    const provider = makeAnonymousProvider(makeSessionCodec(secret), true)
    const result = await Effect.runPromise(
      provider
        .resolve({
          headers: new Headers(),
          url: new URL('https://example.com'),
        })
        .pipe(Effect.provide(inMemoryInteractionLayer())),
    )
    expect(result?.identity.kind).toBe('anonymous')
    expect(result?.setCookie).toContain('HttpOnly')
    expect(result?.setCookie).toContain('Secure')
    expect(result?.setCookie).not.toContain('Anonymous')
  })

  it('stores normalized email server-side and resolves it through the cookie', async () => {
    const codec = makeSessionCodec(secret)
    const layer = inMemoryInteractionLayer()
    const remembered = await Effect.runPromise(
      rememberEmail(codec, ' Ada@Example.COM ', false).pipe(
        Effect.provide(layer),
      ),
    )
    const cookie = remembered.setCookie.split(';')[0]
    const provider = makeEmailProvider(codec, false)
    const resolved = await Effect.runPromise(
      provider
        .resolve({
          headers: new Headers({ cookie }),
          url: new URL('http://localhost'),
        })
        .pipe(Effect.provide(layer)),
    )
    expect(resolved?.identity.email).toBe('ada@example.com')
    expect(cookie).not.toContain('ada@example.com')
  })
})
