import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  rejectDeferredIdentityMode,
  type IdentityMode,
} from '@feedbax/identity'

export type Deployment = 'cloudflare' | 'vercel' | 'node'
export type PackageManager = 'npm' | 'pnpm'
export interface CreateOptions {
  readonly directory: string
  readonly identity: IdentityMode
  readonly deploy: Deployment
  readonly packageManager: PackageManager
  readonly preset: string
  readonly install: boolean
  readonly git: boolean
}

const allowedDeployments = new Set<Deployment>(['cloudflare', 'vercel', 'node'])
const allowedPackageManagers = new Set<PackageManager>(['npm', 'pnpm'])

export function resolveCreateOptions(argv: readonly string[]): CreateOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const directory =
    argv.find((entry) => !entry.startsWith('-')) ?? 'my-feedback'
  const connector = value('--connector') ?? 'notion'
  const storage = value('--storage') ?? 'notion'
  if (connector !== 'notion')
    throw new Error(
      `Connector "${connector}" is not supported in Feedbax 0.1.0.`,
    )
  if (storage !== 'notion')
    throw new Error(
      `Storage "${storage}" is deferred until after Feedbax 0.1.0.`,
    )
  const identity = rejectDeferredIdentityMode(value('--identity') ?? 'email')
  const deploy = (value('--deploy') ?? 'cloudflare') as Deployment
  if (!allowedDeployments.has(deploy))
    throw new Error(`Deployment "${deploy}" is not supported.`)
  const packageManager = (value('--package-manager') ??
    'pnpm') as PackageManager
  if (!allowedPackageManagers.has(packageManager))
    throw new Error(`Package manager "${packageManager}" is not supported.`)
  return {
    directory,
    identity,
    deploy,
    packageManager,
    preset: value('--preset') ?? 'feedbax-default',
    install: !argv.includes('--no-install'),
    git: !argv.includes('--no-git'),
  }
}

async function assertEmpty(path: string) {
  try {
    if ((await readdir(path)).length > 0)
      throw new Error(`Target directory is not empty: ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function replaceInTree(
  path: string,
  replacements: Readonly<Record<string, string>>,
) {
  for (const entry of await readdir(path)) {
    const target = join(path, entry)
    if ((await stat(target)).isDirectory())
      await replaceInTree(target, replacements)
    else {
      let content = await readFile(target, 'utf8')
      for (const [token, replacement] of Object.entries(replacements))
        content = content.replaceAll(token, replacement)
      await writeFile(target, content)
    }
  }
}

export async function createProject(options: CreateOptions) {
  const destination = resolve(options.directory)
  await assertEmpty(destination)
  await mkdir(dirname(destination), { recursive: true })
  const packageDirectory = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(packageDirectory, '../template'),
    resolve(packageDirectory, '../../../templates/default'),
  ]
  let template: string | undefined
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isDirectory()) {
        template = candidate
        break
      }
    } catch {
      continue
    }
  }
  if (!template)
    throw new Error(
      'The Feedbax project template is missing from this package.',
    )
  await cp(template, destination, { recursive: true })
  await replaceInTree(destination, {
    __IDENTITY__: options.identity,
    __DEPLOYMENT__: options.deploy,
    __PACKAGE_MANAGER__: options.packageManager,
    __PRESET__: options.preset,
  })
  return {
    destination,
    nextSteps: [
      `cd ${options.directory}`,
      'Copy .env.example to .env and configure Notion',
      `${options.packageManager === 'pnpm' ? 'pnpm' : 'npx'} feedbax doctor`,
      `${options.packageManager} run dev`,
    ],
  }
}
