import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type Env } from '../src/index.js'

const env: Env = {
  GITHUB_CLIENT_ID: 'client',
  GITHUB_CLIENT_SECRET: 'client-secret',
  GITHUB_OAUTH_CALLBACK: 'https://auth.example/callback',
  FEEDBAX_ORIGIN: 'https://feedback.example',
  FEEDBAX_HANDOFF_ISSUER: 'https://auth.example',
  FEEDBAX_HANDOFF_AUDIENCE: 'feedbax',
  FEEDBAX_HANDOFF_KEY_ID: 'handoff',
  FEEDBAX_HANDOFF_SECRET: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
  OAUTH_STATE_SECRET: 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk',
}

describe('GitHub dogfood handoff', () => {
  it('starts OAuth with signed state and rejects foreign return URLs', async () => {
    const response = await handleRequest(
      new Request('https://auth.example/login?return_to=https://evil.example'),
      env,
    )
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin).toBe('https://github.com')
    expect(location.searchParams.get('scope')).toContain('user:email')
    expect(response.headers.get('set-cookie')).not.toContain('evil.example')
  })

  it('exchanges a verified GitHub identity for a short-lived handoff', async () => {
    const start = await handleRequest(
      new Request(
        'https://auth.example/login?return_to=https%3A%2F%2Ffeedback.example%2Fauth%2Fhandoff%3Freturn_path%3D%2Froadmap',
      ),
      env,
    )
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    )!
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/access_token'))
          return Response.json({ access_token: 'github-token' })
        if (url.endsWith('/user'))
          return Response.json({
            id: 42,
            login: 'jessequartey',
            name: 'Jesse',
            avatar_url: 'https://avatars.example/42.png',
          })
        return Response.json([
          { email: 'jesse@example.test', primary: true, verified: true },
        ])
      })
    const response = await handleRequest(
      new Request(
        `https://auth.example/callback?code=code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: `__Host-feedbax_oauth_state=${state}` } },
      ),
      env,
    )
    fetcher.mockRestore()
    expect(response.status).toBe(303)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.origin).toBe('https://feedback.example')
    expect(decodeJwt(destination.searchParams.get('token')!)).toMatchObject({
      sub: '42',
      role: 'admin',
      return_path: '/roadmap',
    })
  })

  it('rejects callbacks without matching state', async () => {
    const response = await handleRequest(
      new Request('https://auth.example/callback?code=x&state=y'),
      env,
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_OAUTH_CALLBACK' },
    })
  })
})
