// A small, safe Markdown subset for changelog entries. It never produces HTML from the input:
// the parser returns a tree of text nodes, and both renderers (React in
// components/portal/markdown.tsx, and the escaped HTML string below for RSS) only ever emit
// text, so raw HTML such as <script> is shown as literal text. Links are limited to http(s),
// mailto and site-relative paths; anything else (javascript:, data:, vbscript: …) is dropped
// to plain text. Supported: paragraphs, #–### headings, - / * / 1. lists, > quotes, ``` code
// fences, --- rules, **bold**, *italic*, `code` and [text](url).

export type Inline =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "rule" };

/** Absolute http(s) and mailto URLs, and site-relative paths. Everything else is refused. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  // Control characters and whitespace can hide a scheme from a naive check ("java\tscript:").
  // oxlint-disable-next-line no-control-regex
  if (!value || /[\u0000-\u001f\u007f\s]/u.test(value) || value.length > 2000) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value;
  try {
    const url = new URL(value);
    if (["http:", "https:", "mailto:"].includes(url.protocol) && url.href) return value;
  } catch {
    // Not an absolute URL.
  }
  return null;
}

const MAX_DEPTH = 4;

function parseInline(source: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    if (char === "\\" && i + 1 < source.length && /[\\`*_[\]()#>-]/.test(source[i + 1]!)) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }
    if (char === "\n") {
      flush();
      out.push({ type: "break" });
      i++;
      continue;
    }
    if (char === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (depth < MAX_DEPTH && (source.startsWith("**", i) || source.startsWith("__", i))) {
      const mark = source.slice(i, i + 2);
      const end = source.indexOf(mark, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(source.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < MAX_DEPTH && char === "*") {
      const end = source.indexOf("*", i + 1);
      if (end > i + 1 && source[i + 1] !== " " && source[end - 1] !== " ") {
        flush();
        out.push({ type: "em", children: parseInline(source.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (depth < MAX_DEPTH && char === "[") {
      const link = /^\[([^\]\n]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/.exec(source.slice(i));
      if (link) {
        const href = safeHref(link[2]!);
        flush();
        const children = parseInline(link[1]!, depth + 1);
        // A refused URL leaves just the link text, never the URL.
        if (href) out.push({ type: "link", href, children });
        else out.push(...children);
        i += link[0].length;
        continue;
      }
    }
    buffer += char;
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      endParagraph();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      endParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({
        type: "heading",
        level: Math.min(heading[1]!.length, 3) as 1 | 2 | 3,
        children: parseInline(heading[2]!),
      });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      endParagraph();
      blocks.push({ type: "rule" });
      continue;
    }
    const item = /^\s{0,3}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/.exec(line);
    if (item) {
      endParagraph();
      const ordered = item[2] !== undefined;
      const items: Inline[][] = [];
      for (; i < lines.length; i++) {
        const next = /^\s{0,3}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/.exec(lines[i]!);
        if (!next || (next[2] !== undefined) !== ordered) break;
        items.push(parseInline(next[3]!));
      }
      i--;
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      endParagraph();
      const quoted: string[] = [];
      for (; i < lines.length && /^\s{0,3}>/.test(lines[i]!); i++)
        quoted.push(lines[i]!.replace(/^\s{0,3}>\s?/, ""));
      i--;
      blocks.push({ type: "quote", children: parseInline(quoted.join("\n")) });
      continue;
    }
    paragraph.push(line);
  }
  endParagraph();
  return blocks;
}

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escapeHtml(node.text);
        case "break":
          return "<br />";
        case "code":
          return `<code>${escapeHtml(node.text)}</code>`;
        case "strong":
          return `<strong>${inlineHtml(node.children)}</strong>`;
        case "em":
          return `<em>${inlineHtml(node.children)}</em>`;
        case "link":
          return `<a href="${escapeHtml(node.href)}" rel="noopener nofollow">${inlineHtml(node.children)}</a>`;
      }
    })
    .join("");
}

/** The same tree as an escaped HTML string (the RSS description). Safe to embed as is. */
export function markdownToHtml(source: string): string {
  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return `<p>${inlineHtml(block.children)}</p>`;
        case "heading":
          return `<h${block.level + 2}>${inlineHtml(block.children)}</h${block.level + 2}>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
        }
        case "quote":
          return `<blockquote>${inlineHtml(block.children)}</blockquote>`;
        case "code":
          return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
        case "rule":
          return "<hr />";
      }
    })
    .join("");
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "code"
        ? node.text
        : node.type === "break"
          ? " "
          : inlineText(node.children),
    )
    .join("");
}

/** The entry as plain text on one line, cut at `max` characters (page descriptions). */
export function markdownToText(source: string, max = 160): string {
  const text = parseMarkdown(source)
    .map((block) =>
      block.type === "list"
        ? block.items.map(inlineText).join(" ")
        : block.type === "code"
          ? block.text
          : block.type === "rule"
            ? ""
            : inlineText(block.children),
    )
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const letters = Array.from(text);
  return letters.length > max ? `${letters.slice(0, max - 1).join("")}…` : text;
}

const linkText = (text: string, href: string) => (text === href ? text : `${text} (${href})`);

function plainInline(nodes: Inline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "code"
        ? node.text
        : node.type === "break"
          ? "\n"
          : node.type === "link"
            ? linkText(plainInline(node.children), node.href)
            : plainInline(node.children),
    )
    .join("");
}

/**
 * The whole body as plain text, no cut and no HTML: blocks are separated by a blank line, list
 * items sit on their own lines ("- " or "1. "), links keep their address in brackets. Used where
 * a reader cannot render Markdown (webhook payloads carry both forms).
 */
export function markdownToPlainText(source: string): string {
  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case "list":
          return block.items
            .map((item, i) => `${block.ordered ? `${i + 1}.` : "-"} ${plainInline(item)}`)
            .join("\n");
        case "code":
          return block.text;
        case "rule":
          return "";
        default:
          return plainInline(block.children);
      }
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
