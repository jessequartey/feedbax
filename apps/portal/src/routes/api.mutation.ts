import { createFileRoute } from '@tanstack/react-router'
import { cookieValue, json, mutationInput, publicError, secureCookie } from '../spike.js'
export const Route = createFileRoute('/api/mutation')({ server: { handlers: { POST: async ({ request }) => {
  let body: unknown
  try { body = await request.json() } catch { return publicError(400, 'INVALID_JSON', 'The request body must be valid JSON.') }
  if (!mutationInput(body)) return publicError(422, 'INVALID_MUTATION', 'The action must be increment.')
  const current = Number.parseInt(cookieValue(request.headers.get('cookie')) ?? '0', 10)
  const count = Number.isFinite(current) ? current + 1 : 1
  return json({ ok: true, count }, { headers: { 'set-cookie': secureCookie(String(count)), 'cache-control': 'no-store' } })
} } } })
