const base = (
  process.argv.find((value) => /^https?:\/\//.test(value)) ?? ''
).replace(/\/$/, '')
if (!base) throw new Error('Usage: node scripts/smoke.mjs <deployment-url>')

for (const path of ['/', '/docs', '/docs/quickstart', '/docs/notion-setup']) {
  const response = await fetch(`${base}${path}`)
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`)
  const html = await response.text()
  if (!html.toLowerCase().includes('feedbax'))
    throw new Error(`${path} did not return the Feedbax site.`)
}

console.log(`Verified Feedbax docs at ${base}.`)
