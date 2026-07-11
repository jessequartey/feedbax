export const SPIKE_COOKIE = 'feedbax_spike'

export type PublicError = { error: { code: string; message: string } }

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function publicError(status: number, code: string, message: string) {
  return json({ error: { code, message } } satisfies PublicError, { status })
}

export function readEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  return runtime.process?.env?.[name]
}

export function envStatus() {
  return { marker: readEnv('FEEDBAX_SPIKE_MARKER') ?? 'local', notionConfigured: Boolean(readEnv('NOTION_TOKEN') && readEnv('NOTION_RESOURCE_ID')) }
}

export function secureCookie(value: string) {
  const expires = new Date(Date.now() + 60 * 60 * 1000).toUTCString()
  return `${SPIKE_COOKIE}=${encodeURIComponent(value)}; Path=/; Expires=${expires}; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`
}

export function cookieValue(header: string | null) {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${SPIKE_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1] ?? '') : undefined
}

export function mutationInput(value: unknown): { action: 'increment' } | undefined {
  if (!value || typeof value !== 'object') return undefined
  return (value as { action?: unknown }).action === 'increment' ? { action: 'increment' } : undefined
}

export function cachePayload() {
  return { kind: 'feedbax-spike', version: 1 }
}

export const CACHE_ETAG = '"feedbax-spike-v1"'

export async function fetchNotion(fetcher: typeof fetch = fetch) {
  const token = readEnv('NOTION_TOKEN')
  const resourceId = readEnv('NOTION_RESOURCE_ID')
  if (!token || !resourceId) throw new Error('NOTION_NOT_CONFIGURED')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetcher(`https://api.notion.com/v1/pages/${encodeURIComponent(resourceId)}`, {
      headers: { authorization: `Bearer ${token}`, 'notion-version': '2026-03-11' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`NOTION_HTTP_${response.status}`)
    const result = await response.json() as { object?: unknown; id?: unknown }
    if (result.object !== 'page' || typeof result.id !== 'string') throw new Error('NOTION_INVALID_RESPONSE')
    return { connected: true, object: 'page' as const }
  } finally {
    clearTimeout(timeout)
  }
}
