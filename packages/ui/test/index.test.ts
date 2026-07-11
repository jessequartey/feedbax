import { describe, expectTypeOf, it } from 'vitest'
import type { AppShellProps } from '../src/index.js'
describe('AppShell', () => {
  it('requires shell copy', () => {
    expectTypeOf<AppShellProps['title']>().toBeString()
  })
})
