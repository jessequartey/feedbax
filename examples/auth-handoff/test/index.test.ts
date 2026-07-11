import { describe, expect, it } from 'vitest'
import { exampleHandoff } from '../src/index.js'
describe('handoff example', () => {
  it('uses a stable subject', () => {
    expect(exampleHandoff.identity.subject).toBe('example-user')
  })
})
