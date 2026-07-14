import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { add, doctor, readMetadata } from '../src/index.js'

const originalEnvironment = { ...process.env }
afterEach(() => {
  process.env = { ...originalEnvironment }
})

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'feedbax-cli-'))
  await writeFile(
    join(directory, 'feedbax.jsonc'),
    `{// this comment must survive edits\n  "version": 1,\n  "connector": "notion",\n  "identity": "email",\n  "interactionStore": "notion",\n  "deployment": "cloudflare",\n  "packageManager": "pnpm",\n  "shadcn": { "preset": "default", "workspace": "packages/ui" }\n}\n`,
  )
  await writeFile(join(directory, 'feedbax.config.ts'), 'export default {}\n')
  return directory
}

describe('feedbax project lifecycle', () => {
  it('preserves JSONC comments while changing supported extensions', async () => {
    const directory = await fixture()
    await add('identity', 'handoff', directory)
    await add('deploy', 'node', directory)
    expect(await readFile(join(directory, 'feedbax.jsonc'), 'utf8')).toContain(
      '// this comment must survive edits',
    )
    await expect(readMetadata(directory)).resolves.toMatchObject({
      identity: 'handoff',
      deployment: 'node',
    })
  })

  it('accepts trailing commas emitted by the project generator', async () => {
    const directory = await fixture()
    const path = join(directory, 'feedbax.jsonc')
    const source = await readFile(path, 'utf8')
    await writeFile(path, source.replace('\n}', ',\n}'))
    await expect(readMetadata(directory)).resolves.toMatchObject({
      connector: 'notion',
      identity: 'email',
    })
  })

  it.each([
    ['identity', 'better-auth'],
    ['storage', 'sqlite'],
    ['storage', 'postgres'],
  ])(
    'rejects deferred %s %s without changing metadata',
    async (kind, value) => {
      const directory = await fixture()
      const path = join(directory, 'feedbax.jsonc')
      const before = await readFile(path, 'utf8')
      await expect(add(kind, value, directory)).rejects.toThrow(
        /not supported|deferred/,
      )
      await expect(readFile(path, 'utf8')).resolves.toBe(before)
    },
  )

  it('rejects unknown extension kinds without changing metadata', async () => {
    const directory = await fixture()
    const path = join(directory, 'feedbax.jsonc')
    const before = await readFile(path, 'utf8')
    await expect(add('foo', 'bar', directory)).rejects.toThrow(/unsupported/)
    await expect(readFile(path, 'utf8')).resolves.toBe(before)
  })

  it.each([
    ['deployment', 'lambda'],
    ['packageManager', 'yarn'],
    ['shadcn', null],
  ])('rejects malformed metadata field %s', async (field, value) => {
    const directory = await fixture()
    const path = join(directory, 'feedbax.jsonc')
    const metadata = JSON.parse(
      (await readFile(path, 'utf8')).replace(
        '// this comment must survive edits',
        '',
      ),
    ) as Record<string, unknown>
    metadata[field] = value
    await writeFile(path, JSON.stringify(metadata))
    await expect(readMetadata(directory)).rejects.toThrow(
      /invalid or unsupported/,
    )
  })

  it('reports environment names without their secret values', async () => {
    const directory = await fixture()
    process.env.NOTION_TOKEN = 'do-not-print-notion'
    process.env.FEEDBAX_SESSION_SECRET = 'do-not-print-session'
    const result = await doctor(directory)
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('do-not-print')
  })

  it('diagnoses invalid metadata, missing product config, and missing secrets', async () => {
    const directory = await fixture()
    delete process.env.NOTION_TOKEN
    delete process.env.FEEDBAX_SESSION_SECRET
    await writeFile(join(directory, 'feedbax.jsonc'), '{ invalid')
    await rm(join(directory, 'feedbax.config.ts'))
    const result = await doctor(directory)
    expect(result.ok).toBe(false)
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_INVALID', status: 'fail' }),
        expect.objectContaining({
          code: 'NOTION_TOKEN_MISSING',
          status: 'fail',
        }),
        expect.objectContaining({
          code: 'FEEDBAX_SESSION_SECRET_MISSING',
          status: 'fail',
        }),
        expect.objectContaining({
          code: 'PRODUCT_CONFIG_MISSING',
          status: 'fail',
        }),
      ]),
    )
  })
})
