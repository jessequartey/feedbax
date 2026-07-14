import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { rejectDeferredIdentityMode } from '@feedbax/identity'

export interface ProjectMetadata {
  version: 1
  connector: 'notion'
  identity: 'anonymous' | 'email' | 'handoff'
  interactionStore: 'notion'
  deployment: 'cloudflare' | 'vercel' | 'node'
  packageManager: 'npm' | 'pnpm'
  shadcn: { preset: string; workspace: string }
}
export async function readMetadata(
  cwd = process.cwd(),
): Promise<ProjectMetadata> {
  const path = resolve(cwd, 'feedbax.jsonc')
  const source = await readFile(path, 'utf8')
  const errors: ParseError[] = []
  const value = parse(source, errors) as ProjectMetadata
  if (
    errors.length ||
    value?.version !== 1 ||
    value.connector !== 'notion' ||
    value.interactionStore !== 'notion'
  )
    throw new Error('feedbax.jsonc is invalid or unsupported.')
  rejectDeferredIdentityMode(value.identity)
  return value
}
export async function doctor(cwd = process.cwd()) {
  const checks: {
    owner: string
    code: string
    status: 'pass' | 'fail' | 'warning'
    message: string
  }[] = []
  try {
    await readMetadata(cwd)
    checks.push({
      owner: 'project',
      code: 'CONFIG_OK',
      status: 'pass',
      message: 'feedbax.jsonc is valid.',
    })
  } catch (error) {
    checks.push({
      owner: 'project',
      code: 'CONFIG_INVALID',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    })
  }
  for (const [name, owner] of [
    ['NOTION_TOKEN', 'connector'],
    ['FEEDBAX_SESSION_SECRET', 'identity'],
  ] as const)
    checks.push(
      process.env[name]
        ? {
            owner,
            code: `${name}_OK`,
            status: 'pass',
            message: `${name} is configured.`,
          }
        : {
            owner,
            code: `${name}_MISSING`,
            status: 'fail',
            message: `Set ${name} in the server environment.`,
          },
    )
  try {
    await access(resolve(cwd, 'feedbax.config.ts'))
    checks.push({
      owner: 'project',
      code: 'PRODUCT_CONFIG_OK',
      status: 'pass',
      message: 'feedbax.config.ts exists.',
    })
  } catch {
    checks.push({
      owner: 'project',
      code: 'PRODUCT_CONFIG_MISSING',
      status: 'fail',
      message: 'Restore feedbax.config.ts.',
    })
  }
  return { ok: checks.every((check) => check.status !== 'fail'), checks }
}
export async function add(kind: string, value: string, cwd = process.cwd()) {
  if (kind === 'identity') rejectDeferredIdentityMode(value)
  if (kind === 'storage' && value !== 'notion')
    throw new Error(`Storage "${value}" is deferred until after Feedbax 0.1.0.`)
  if (kind === 'connector' && value !== 'notion')
    throw new Error(`Connector "${value}" is unsupported.`)
  if (kind === 'deploy' && !['cloudflare', 'vercel', 'node'].includes(value))
    throw new Error(`Deployment "${value}" is unsupported.`)
  const path = resolve(cwd, 'feedbax.jsonc')
  const source = await readFile(path, 'utf8')
  const property =
    kind === 'storage'
      ? 'interactionStore'
      : kind === 'deploy'
        ? 'deployment'
        : kind
  const updated = applyEdits(
    source,
    modify(source, [property], value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  )
  await writeFile(path, updated)
  return { property, value }
}
export const requiredEnvironment = [
  'NOTION_TOKEN',
  'FEEDBAX_SESSION_SECRET',
] as const
