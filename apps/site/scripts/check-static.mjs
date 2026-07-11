import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const routes = ['', 'docs', 'docs/product-vision', 'docs/quickstart', 'docs/configuration', 'docs/authentication-handoff', 'docs/notion-setup', 'docs/deployment', 'docs/roadmap', 'docs/contributing']
const output = resolve(import.meta.dirname, '..', '.output', 'public')

for (const route of routes) {
  const file = route === '' ? resolve(output, '_shell.html') : resolve(output, route, 'index.html')
  await access(file)
  const html = await readFile(file, 'utf8')
  if (!html.includes('feedbax')) throw new Error(`Static route is missing Feedbax shell: /${route}`)
}

console.log(`Verified ${routes.length} independently deployable static routes.`)
