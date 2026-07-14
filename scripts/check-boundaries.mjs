import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const layers = new Map([
  ['packages/domain', new Set()],
  ['packages/contracts', new Set(['@feedbax/domain'])],
  [
    'packages/connector-sdk',
    new Set(['@feedbax/contracts', '@feedbax/domain']),
  ],
  [
    'packages/identity',
    new Set(['@feedbax/contracts', '@feedbax/domain', '@feedbax/storage']),
  ],
  ['packages/storage', new Set(['@feedbax/contracts', '@feedbax/domain'])],
  [
    'packages/server',
    new Set([
      '@feedbax/contracts',
      '@feedbax/domain',
      '@feedbax/connector-sdk',
      '@feedbax/identity',
      '@feedbax/storage',
      '@feedbax/observability',
    ]),
  ],
])

const sourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name)
        return entry.isDirectory()
          ? sourceFiles(path)
          : /\.[cm]?[jt]sx?$/.test(entry.name)
            ? [path]
            : []
      }),
    )
  ).flat()
}

const errors = []
for (const [workspace, allowed] of layers) {
  for (const file of await sourceFiles(join(root, workspace, 'src'))) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()(['"])(@feedbax\/[^'"/]+)\1/g,
    )) {
      if (!allowed.has(match[2]))
        errors.push(
          `${relative(root, file)} imports forbidden layer ${match[2]}`,
        )
    }
  }
}

const canonicalSchemaWorkspaces = [
  'packages/core',
  'packages/config',
  'packages/contracts',
  'packages/domain',
]
for (const workspace of canonicalSchemaWorkspaces) {
  for (const file of await sourceFiles(join(root, workspace, 'src'))) {
    const source = await readFile(file, 'utf8')
    if (/(?:from\s+|import\s*\()(['"])zod\1/.test(source))
      errors.push(
        `${relative(root, file)} imports Zod instead of canonical Effect Schema`,
      )
  }
}

const publicPackages = [
  'packages/core',
  'packages/auth',
  'packages/cli',
  'packages/create-feedbax',
  'connectors/notion',
]
const privatePackages = [
  '@feedbax/contracts',
  '@feedbax/domain',
  '@feedbax/connector-sdk',
  '@feedbax/identity',
  '@feedbax/storage',
  '@feedbax/server',
]
for (const workspace of publicPackages) {
  const declaration = join(root, workspace, 'dist', 'index.d.ts')
  let source = ''
  try {
    source = await readFile(declaration, 'utf8')
  } catch {
    continue
  }
  for (const dependency of privatePackages) {
    if (source.includes(dependency))
      errors.push(
        `${relative(root, declaration)} exposes private package ${dependency}`,
      )
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('Dependency boundaries are valid.')
}
