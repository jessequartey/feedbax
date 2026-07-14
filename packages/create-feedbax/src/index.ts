import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
type IdentityMode = 'anonymous' | 'email' | 'handoff'

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

const valueFlags = new Set([
  '--connector',
  '--identity',
  '--storage',
  '--deploy',
  '--preset',
  '--package-manager',
])
const booleanFlags = new Set(['--yes', '--no-install', '--no-git'])

const allowedDeployments = new Set<Deployment>(['cloudflare', 'vercel', 'node'])
const allowedPackageManagers = new Set<PackageManager>(['npm', 'pnpm'])
const identityMode = (mode: string): IdentityMode => {
  if (mode === 'anonymous' || mode === 'email' || mode === 'handoff')
    return mode
  throw new Error(`Identity mode "${mode}" is not supported in Feedbax 0.1.0.`)
}

export function resolveCreateOptions(argv: readonly string[]): CreateOptions {
  const values = new Map<string, string>()
  let directory: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index]!
    if (valueFlags.has(entry)) {
      const next = argv[index + 1]
      if (!next || next.startsWith('-'))
        throw new Error(`Option ${entry} requires a value.`)
      values.set(entry, next)
      index += 1
    } else if (booleanFlags.has(entry)) continue
    else if (entry.startsWith('-')) throw new Error(`Unknown option ${entry}.`)
    else if (directory) throw new Error(`Unexpected argument ${entry}.`)
    else directory = entry
  }
  const value = (name: string) => values.get(name)
  directory ??= 'my-feedback'
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
  const identity = identityMode(value('--identity') ?? 'email')
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

const run = (command: string, args: readonly string[], cwd: string) =>
  new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(
            new Error(`${command} ${args.join(' ')} failed with ${code}.`),
          ),
    )
  })

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
    __GENERATOR_VERSION__: '0.1.0',
    __IDENTITY__: options.identity,
    __DEPLOYMENT__: options.deploy,
    __PACKAGE_MANAGER__: options.packageManager,
    __PACKAGE_MANAGER_SPEC__:
      options.packageManager === 'pnpm' ? 'pnpm@10.29.3' : 'npm@11.4.2',
    __PRESET__: options.preset,
    __NITRO_PRESET__:
      options.deploy === 'vercel'
        ? 'vercel'
        : options.deploy === 'cloudflare'
          ? 'cloudflare-module'
          : 'node-server',
  })
  try {
    if (options.install) {
      await run(options.packageManager, ['install'], destination)
      await run(options.packageManager, ['run', 'type-check'], destination)
    }
    if (options.git) await run('git', ['init'], destination)
  } catch (error) {
    await writeFile(
      join(destination, '.feedbax-recovery'),
      `Generation stopped: ${error instanceof Error ? error.message : String(error)}\nRerun dependency installation and type checking after resolving the reported issue.\n`,
    )
    throw error
  }
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
