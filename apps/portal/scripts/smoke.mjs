import assert from 'node:assert/strict'

const argument = process.argv.slice(2).find((value) => value !== '--')
const base = (argument || process.env.SPIKE_BASE_URL || '').replace(/\/$/, '')
if (!base) throw new Error('Usage: pnpm smoke <base-url>')
const request = (path, init) =>
  fetch(`${base}${path}`, { redirect: 'manual', ...init })
const home = await request('/')
assert.equal(home.status, 200)
const html = await home.text()
assert.match(html, /<title>Feedbax Feedback<\/title>/)
assert.match(
  html,
  /<meta name="description" content="Shape what we build next\."\/>/,
)
assert.match(html, /\/brand\/logo\.svg/)
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
assert.equal((await request('/api/error?kind=expected')).status, 400)
const unexpected = await request('/api/error')
assert.equal(unexpected.status, 500)
const unexpectedBody = await unexpected.json()
assert.equal(unexpectedBody.error.code, 'UNEXPECTED_ERROR')
assert.equal(unexpectedBody.error.message, 'An unexpected error occurred.')
assert.equal(unexpectedBody.error.retryable, true)
assert.equal(
  unexpectedBody.error.requestId,
  unexpected.headers.get('x-request-id'),
)
assert.match(unexpectedBody.error.requestId, /^[a-zA-Z0-9._-]{1,100}$/)
console.log(`Spike smoke test passed: ${base}`)
