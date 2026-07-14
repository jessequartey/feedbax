import { describe, expect, it } from 'vitest'
import {
  resolveCreateOptions,
  resolveInteractiveCreateOptions,
} from '../src/index.js'

describe('create-feedbax compatibility', () => {
  it('uses the database-free launch defaults', () => {
    expect(resolveCreateOptions(['portal'])).toMatchObject({
      identity: 'email',
      deploy: 'cloudflare',
      packageManager: 'pnpm',
    })
  })

  it('applies interactive answers and validates them through the same parser', async () => {
    const answers = ['handoff', 'vercel', 'npm', 'slate-lucide']
    const questions: string[] = []
    const options = await resolveInteractiveCreateOptions(
      ['portal', '--no-install', '--no-git'],
      (question) => {
        questions.push(question)
        return Promise.resolve(answers.shift()!)
      },
    )
    expect(questions).toHaveLength(4)
    expect(options).toMatchObject({
      directory: 'portal',
      identity: 'handoff',
      deploy: 'vercel',
      packageManager: 'npm',
      preset: 'slate-lucide',
      install: false,
      git: false,
    })
  })

  it('does not prompt in --yes mode', async () => {
    const prompt = () => Promise.reject(new Error('must not prompt'))
    await expect(
      resolveInteractiveCreateOptions(['portal', '--yes'], prompt),
    ).resolves.toMatchObject({ identity: 'email', deploy: 'cloudflare' })
  })
  it.each([
    ['--identity', 'better-auth'],
    ['--storage', 'sqlite'],
    ['--storage', 'postgres'],
  ])('rejects deferred %s %s before generation', (flag, value) => {
    expect(() => resolveCreateOptions(['portal', flag, value])).toThrow(
      /not supported|deferred/,
    )
  })

  it('does not interpret flag values as the target directory', () => {
    expect(
      resolveCreateOptions([
        '--identity',
        'anonymous',
        '--deploy',
        'node',
        '--yes',
      ]),
    ).toMatchObject({
      directory: 'my-feedback',
      identity: 'anonymous',
      deploy: 'node',
    })
  })

  it.each([['--identity'], ['--wat'], ['one', 'two']])(
    'rejects malformed arguments before generation: %s',
    (...args) => expect(() => resolveCreateOptions(args)).toThrow(),
  )
})
