import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'

export interface ProjectMetadata {
  $schema?: string
  version: 1
  generatorVersion?: string
  connector: 'notion'
  identity: 'anonymous' | 'email' | 'handoff'
  interactionStore: 'notion'
  deployment: 'cloudflare' | 'vercel' | 'node'
  packageManager: 'npm' | 'pnpm'
  shadcn: { preset: string; workspace: string }
}
const identityMode = (mode: string) => {
  if (mode === 'anonymous' || mode === 'email' || mode === 'handoff')
    return mode
  throw new Error(`Identity mode "${mode}" is not supported in Feedbax 0.1.0.`)
}
const metadataError = () =>
  new Error('feedbax.jsonc is invalid or unsupported.')
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const projectMetadata = (value: unknown): ProjectMetadata => {
  if (!value || typeof value !== 'object') throw metadataError()
  const input = value as Record<string, unknown>
  const allowedKeys = new Set([
    '$schema',
    'version',
    'generatorVersion',
    'connector',
    'identity',
    'interactionStore',
    'deployment',
    'packageManager',
    'shadcn',
  ])
  const shadcnKeys =
    input.shadcn && typeof input.shadcn === 'object'
      ? Object.keys(input.shadcn)
      : []
  if (
    Object.keys(input).some((key) => !allowedKeys.has(key)) ||
    (input.$schema !== undefined && !isNonEmptyString(input.$schema)) ||
    input.version !== 1 ||
    (input.generatorVersion !== undefined &&
      !isNonEmptyString(input.generatorVersion)) ||
    input.connector !== 'notion' ||
    !['anonymous', 'email', 'handoff'].includes(String(input.identity)) ||
    input.interactionStore !== 'notion' ||
    !['cloudflare', 'vercel', 'node'].includes(String(input.deployment)) ||
    !['npm', 'pnpm'].includes(String(input.packageManager)) ||
    !input.shadcn ||
    typeof input.shadcn !== 'object' ||
    shadcnKeys.some((key) => !['preset', 'workspace'].includes(key)) ||
    !isNonEmptyString((input.shadcn as Record<string, unknown>).preset) ||
    !isNonEmptyString((input.shadcn as Record<string, unknown>).workspace)
  )
    throw metadataError()
  return input as unknown as ProjectMetadata
}
export async function readMetadata(
  cwd = process.cwd(),
): Promise<ProjectMetadata> {
  const path = resolve(cwd, 'feedbax.jsonc')
  const source = await readFile(path, 'utf8')
  const errors: ParseError[] = []
  const value: unknown = parse(source, errors)
  if (errors.length) throw metadataError()
  return projectMetadata(value)
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
  if (!['connector', 'identity', 'storage', 'deploy'].includes(kind))
    throw new Error(`Extension kind "${kind}" is unsupported.`)
  if (kind === 'identity') identityMode(value)
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
