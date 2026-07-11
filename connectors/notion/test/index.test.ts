import { describe, expect, it } from 'vitest'
import { notionConnector } from '../src/index.js'
describe('Notion connector descriptor', () => {
  it('declares its boundary', () => {
    expect(notionConnector.id).toBe('notion')
  })
})
