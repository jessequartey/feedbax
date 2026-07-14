import { describe, expect, it } from 'vitest'
import { resolveCreateOptions } from '../src/index.js'

describe('create-feedbax compatibility', () => {
  it('uses the database-free launch defaults', () => {
    expect(resolveCreateOptions(['portal'])).toMatchObject({
      identity: 'email',
      deploy: 'cloudflare',
      packageManager: 'pnpm',
    })
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
