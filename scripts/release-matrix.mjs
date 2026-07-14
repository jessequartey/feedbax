import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const temporary = await mkdtemp(join(tmpdir(), 'feedbax-release-'))
const packs = join(temporary, 'packs')

const run = (command, args, cwd = root) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, CI: '1' },
    })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} failed with ${code}`)),
    )
  })

await mkdir(packs, { recursive: true })
for (const name of [
  'create-feedbax',
  'feedbax',
  '@feedbax/core',
  '@feedbax/notion',
  '@feedbax/auth-handoff',
])
  await run('pnpm', ['--filter', name, 'pack', '--pack-destination', packs])

const archiveNames = await readdir(packs)
const archive = (part) => {
  const name = archiveNames.find((entry) => entry === part)
  if (!name) throw new Error(`Missing packed archive containing ${part}`)
  return join(packs, name)
}
const archives = {
  create: archive('create-feedbax-0.1.0.tgz'),
  cli: archive('feedbax-0.1.0.tgz'),
  core: archive('feedbax-core-0.1.0.tgz'),
  notion: archive('feedbax-notion-0.1.0.tgz'),
  handoff: archive('feedbax-auth-handoff-0.1.0.tgz'),
}

const matrix = [
  {
    identity: 'anonymous',
    deploy: 'cloudflare',
    manager: 'pnpm',
    preset: 'feedbax-default',
  },
  {
    identity: 'email',
    deploy: 'node',
    manager: 'npm',
    preset: 'zinc-new-york',
  },
  {
    identity: 'handoff',
    deploy: 'vercel',
    manager: 'pnpm',
    preset: 'slate-lucide',
  },
]

for (const entry of matrix) {
  const name = `${entry.identity}-${entry.deploy}-${entry.manager}`
  const destination = join(temporary, name)
  await run('npm', [
    'exec',
    '--yes',
    `--package=${archives.create}`,
    '--',
    'create-feedbax',
    destination,
    '--identity',
    entry.identity,
    '--deploy',
    entry.deploy,
    '--package-manager',
    entry.manager,
    '--preset',
    entry.preset,
    '--no-install',
    '--no-git',
  ])

  const rootManifestPath = join(destination, 'package.json')
  const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'))
  rootManifest.devDependencies.feedbax = `file:${archives.cli}`
  rootManifest.overrides = {
    '@feedbax/core': `file:${archives.core}`,
  }
  rootManifest.pnpm = {
    overrides: {
      '@feedbax/core': `file:${archives.core}`,
    },
  }
  await writeFile(
    rootManifestPath,
    `${JSON.stringify(rootManifest, null, 2)}\n`,
  )

  const portalManifestPath = join(destination, 'apps/portal/package.json')
  const portalManifest = JSON.parse(await readFile(portalManifestPath, 'utf8'))
  portalManifest.dependencies['@feedbax/core'] = `file:${archives.core}`
  portalManifest.dependencies['@feedbax/notion'] = `file:${archives.notion}`
  if (entry.identity === 'handoff')
    portalManifest.dependencies['@feedbax/auth-handoff'] =
      `file:${archives.handoff}`
  await writeFile(
    portalManifestPath,
    `${JSON.stringify(portalManifest, null, 2)}\n`,
  )

  await run(entry.manager, ['install'], destination)
  if (entry.preset === 'feedbax-default')
    await run(
      'npm',
      [
        'exec',
        '--yes',
        '--package=shadcn@4.13.0',
        '--',
        'shadcn',
        'add',
        'button',
        '--yes',
        '--cwd',
        join(destination, 'apps/portal'),
      ],
      destination,
    )
  await run(entry.manager, ['run', 'type-check'], destination)
  await run(entry.manager, ['run', 'build'], destination)

  const metadata = await readFile(join(destination, 'feedbax.jsonc'), 'utf8')
  for (const expected of [
    entry.identity,
    entry.deploy,
    entry.manager,
    entry.preset,
    '0.1.0',
  ])
    if (!metadata.includes(expected))
      throw new Error(`${name} metadata omitted ${expected}`)
  console.log(
    `Verified ${relative(temporary, destination)} from packed packages.`,
  )
}
