const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
const safeHref = (value: string) =>
  (() => {
    try {
      const decoded = decodeURIComponent(value).trim()
      return /^(https?:|mailto:)/i.test(decoded) ? value : '#'
    } catch { return '#' }
  })()

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
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return html
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split('\n')
      if (lines.every((line) => /^[-*] /.test(line)))
        return `<ul>${lines.map((line) => `<li>${line.slice(2)}</li>`).join('')}</ul>`
      if (lines.every((line) => /^\d+\. /.test(line)))
        return `<ol>${lines.map((line) => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('')}</ol>`
      return `<p>${lines.join('<br>')}</p>`
    })
    .join('')
}
