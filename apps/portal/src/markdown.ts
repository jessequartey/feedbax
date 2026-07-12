const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
const safeHref = (value: string) =>
  /^(https?:|mailto:)/i.test(value) ? value : '#'

/** Minimal allowlist renderer: raw HTML is escaped and only safe links plus basic Markdown are emitted. */
export function renderSanitizedMarkdown(markdown: string): string {
  let html = escapeHtml(markdown)
  html = html.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, href: string) =>
      `<a href="${escapeHtml(safeHref(href))}" rel="nofollow noopener noreferrer">${label}</a>`,
  )
  html = html
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return html
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br>')}</p>`)
    .join('')
}
