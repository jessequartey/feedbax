import { SignJWT, base64url } from 'jose'

export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  GITHUB_OAUTH_CALLBACK: string
  FEEDBAX_ORIGIN: string
  FEEDBAX_HANDOFF_ISSUER: string
  FEEDBAX_HANDOFF_AUDIENCE: string
  FEEDBAX_HANDOFF_KEY_ID: string
  FEEDBAX_HANDOFF_SECRET: string
  OAUTH_STATE_SECRET: string
}

const stateCookie = '__Host-feedbax_oauth_state'
const encoder = new TextEncoder()
const bytes = (value: string) => Uint8Array.from(base64url.decode(value))

function json(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}

function redirect(location: string, cookie?: string) {
  const headers = new Headers({
    location,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  if (cookie) headers.set('set-cookie', cookie)
  return new Response(null, { status: 303, headers })
}

function cookieValue(request: Request, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = request.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
  return match?.[1]
}

function acceptedReturnTo(value: string | null, feedbaxOrigin: string) {
  const fallback = new URL('/auth/handoff', feedbaxOrigin)
  if (!value) return fallback
  try {
    const candidate = new URL(value)
    return candidate.origin === fallback.origin &&
      candidate.pathname === fallback.pathname
      ? candidate
      : fallback
  } catch {
    return fallback
  }
}

async function stateKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signedState(returnTo: URL, env: Env) {
  const payload = base64url.encode(
    JSON.stringify({
      returnTo: returnTo.toString(),
      nonce: crypto.randomUUID(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    }),
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    await stateKey(env.OAUTH_STATE_SECRET),
    encoder.encode(payload),
  )
  return `${payload}.${base64url.encode(new Uint8Array(signature))}`
}

async function verifiedState(value: string, env: Env) {
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra) return null
  const valid = await crypto.subtle.verify(
    'HMAC',
    await stateKey(env.OAUTH_STATE_SECRET),
    bytes(signature),
    encoder.encode(payload),
  )
  if (!valid) return null
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64url.decode(payload)),
    ) as { returnTo?: unknown; expiresAt?: unknown }
    if (
      typeof parsed.returnTo !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    )
      return null
    return acceptedReturnTo(parsed.returnTo, env.FEEDBAX_ORIGIN)
  } catch {
    return null
  }
}

async function github<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'feedbax-dogfood-auth',
      'x-github-api-version': '2022-11-28',
    },
  })
  if (!response.ok) throw new Error('GitHub identity lookup failed.')
  return response.json() as Promise<T>
}

async function login(request: Request, env: Env) {
  const requestUrl = new URL(request.url)
  const returnTo = acceptedReturnTo(
    requestUrl.searchParams.get('return_to'),
    env.FEEDBAX_ORIGIN,
  )
  const state = await signedState(returnTo, env)
  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  authorize.searchParams.set('redirect_uri', env.GITHUB_OAUTH_CALLBACK)
  authorize.searchParams.set('scope', 'read:user user:email')
  authorize.searchParams.set('state', state)
  return redirect(
    authorize.toString(),
    `${stateCookie}=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  )
}

async function callback(request: Request, env: Env) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = cookieValue(request, stateCookie)
  if (!code || !state || !cookieState || state !== cookieState)
    return json(
      400,
      'INVALID_OAUTH_CALLBACK',
      'GitHub sign-in could not be verified.',
    )
  const returnTo = await verifiedState(state, env)
  if (!returnTo)
    return json(
      400,
      'INVALID_OAUTH_CALLBACK',
      'GitHub sign-in could not be verified.',
    )
  const tokenResponse = await fetch(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: env.GITHUB_OAUTH_CALLBACK,
      }),
    },
  )
  const token = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string
  }
  if (!tokenResponse.ok || !token.access_token)
    return json(
      502,
      'GITHUB_UNAVAILABLE',
      'GitHub sign-in is temporarily unavailable.',
    )
  const [user, emails] = await Promise.all([
    github<{
      id: number
      login: string
      name: string | null
      avatar_url: string
    }>('/user', token.access_token),
    github<Array<{ email: string; primary: boolean; verified: boolean }>>(
      '/user/emails',
      token.access_token,
    ),
  ])
  const email = emails.find((entry) => entry.primary && entry.verified)?.email
  if (!email)
    return json(
      403,
      'VERIFIED_EMAIL_REQUIRED',
      'A verified primary GitHub email is required.',
    )
  const issuedAt = Math.floor(Date.now() / 1000)
  const handoff = await new SignJWT({
    email,
    name: user.name?.trim() || user.login,
    picture: user.avatar_url,
    role: user.login.toLowerCase() === 'jessequartey' ? 'admin' : 'customer',
    return_path: returnTo.searchParams.get('return_path') ?? '/',
  })
    .setProtectedHeader({ alg: 'HS256', kid: env.FEEDBAX_HANDOFF_KEY_ID })
    .setIssuer(env.FEEDBAX_HANDOFF_ISSUER)
    .setAudience(env.FEEDBAX_HANDOFF_AUDIENCE)
    .setSubject(String(user.id))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 120)
    .sign(bytes(env.FEEDBAX_HANDOFF_SECRET))
  const destination = new URL('/auth/handoff', env.FEEDBAX_ORIGIN)
  destination.searchParams.set('token', handoff)
  return redirect(
    destination.toString(),
    `${stateCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  )
}

export async function handleRequest(request: Request, env: Env) {
  try {
    const path = new URL(request.url).pathname
    if (request.method !== 'GET')
      return json(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.')
    if (path === '/' || path === '/login') return login(request, env)
    if (path === '/callback') return callback(request, env)
    return json(404, 'NOT_FOUND', 'This route does not exist.')
  } catch {
    return json(
      500,
      'AUTHENTICATION_UNAVAILABLE',
      'Authentication is temporarily unavailable.',
    )
  }
}

export default { fetch: handleRequest }
