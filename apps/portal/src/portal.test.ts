import { describe, expect, it } from 'vitest'
import { notionConnector } from '@feedbax/notion'
describe('portal workspace integration', () => {
  it('resolves an internal connector package', () => {
    expect(notionConnector.displayName).toBe('Notion')
  })
})
