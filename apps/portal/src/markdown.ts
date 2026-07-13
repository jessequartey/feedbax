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
      const heading = lines.length === 1 ? /^(#{1,3})\s+(.+)$/.exec(lines[0]!) : null
      if (heading) {
        const level = heading[1]!.length
        return `<h${level}>${heading[2]}</h${level}>`
      }
      if (lines.every((line) => /^&gt; /.test(line)))
        return `<blockquote><p>${lines.map((line) => line.slice(5)).join('<br>')}</p></blockquote>`
      if (lines.every((line) => /^[-*] /.test(line)))
        return `<ul>${lines.map((line) => `<li>${line.slice(2)}</li>`).join('')}</ul>`
      if (lines.every((line) => /^\d+\. /.test(line)))
        return `<ol>${lines.map((line) => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('')}</ol>`
      return `<p>${lines.join('<br>')}</p>`
    })
    .join('')
}

export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
