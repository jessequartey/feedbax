import assert from 'node:assert/strict'

const argument = process.argv.slice(2).find((value) => value !== '--')
const base = (argument || process.env.SPIKE_BASE_URL || '').replace(/\/$/, '')
if (!base) throw new Error('Usage: pnpm smoke <base-url>')
const request = (path, init) =>
  fetch(`${base}${path}`, { redirect: 'manual', ...init })
const home = await request('/')
assert.equal(home.status, 200)
const html = await home.text()
assert.match(html, /data-spike="ssr"/)
assert.match(html, /server-function/)
assert.doesNotMatch(html, /NOTION_TOKEN|Bearer\s+|SPIKE_INTERNAL_SENTINEL/)
const cached = await request('/api/cache')
assert.equal(cached.status, 200)
assert.match(cached.headers.get('cache-control') || '', /public/)
assert.match(cached.headers.get('cache-control') || '', /max-age=60/)
const etag = cached.headers.get('etag')
assert.ok(etag)
assert.equal(
  (await request('/api/cache', { headers: { 'if-none-match': etag } })).status,
  304,
)
const mutation = await request('/api/mutation', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'increment' }),
})
assert.equal(mutation.status, 200)
const setCookie = mutation.headers.get('set-cookie') || ''
for (const flag of [
  'HttpOnly',
  'Secure',
  'SameSite=Lax',
  'Path=/',
  'Max-Age=3600',
])
  assert.match(setCookie, new RegExp(flag, 'i'))
assert.equal(
  (
    await request('/api/mutation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  ).status,
  422,
)
assert.equal((await request('/api/error?kind=expected')).status, 400)
const unexpected = await request('/api/error')
assert.equal(unexpected.status, 500)
assert.deepEqual(await unexpected.json(), {
  error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
})
console.log(`Spike smoke test passed: ${base}`)
