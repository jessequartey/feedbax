import { describe, expect, it } from 'vitest'
import { renderSanitizedMarkdown } from './markdown.js'
describe('sanitized Markdown', () => {
  it('escapes HTML and unsafe links while retaining allowed formatting', () => {
    const value = renderSanitizedMarkdown(
      '<script>alert(1)</script> **bold** [bad](javascript:alert(1)) [good](https://example.com)',
    )
    expect(value).not.toContain('<script>')
    expect(value).not.toContain('href="javascript:')
    expect(value).toContain('<strong>bold</strong>')
    expect(value).toContain('href="https://example.com"')
  })
})
