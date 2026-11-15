// The one Markdown module of the portal: a small, restricted, dependency-free subset that is
// parsed, normalized and rendered the same way everywhere. Posts, comments and changelog
// entries are stored as this Markdown. Nothing here ever produces HTML from input: the parser
// returns a tree of text nodes, and every renderer only emits text (React escapes it; the
// string renderer below escapes it itself). Raw HTML such as <script> is just literal text.
//
// THE SUBSET
//   Blocks   paragraphs; headings `###` and `####` (`#`/`##` count as `###`, `#####`/`######`
//            as `####`); bulleted (`- `, `* `, `+ `) and numbered (`1.`, `1)`) flat lists;
//            blockquotes (`> `); fenced code blocks (``` fences, the info string is dropped).
//   Inlines  **bold** / __bold__, *italic* / _italic_, `inline code`, [text](url), line breaks.
//   Links    http, https and mailto only. Anything else (javascript:, data:, vbscript:, relative
//            paths, URLs with credentials or whitespace) is dropped and only the link text stays.
//            Rendered with rel="noopener nofollow ugc".
//   Not      images (they stay attachments; `![x](y)` is text plus a link), raw HTML, tables,
//            horizontal rules, nested lists, footnotes, autolinks, strikethrough. They are not
//            an error: the characters simply show up as text.
//   Inline formatting never spans lines. Anything pathological (very deep nesting, thousands of
//   unmatched delimiters) degrades to literal text instead of costing time.
//
// API
//   parseMarkdown(source): Block[]            the tree; total, never throws, bounded work
//   normalizeMarkdown, blocksToMarkdown, escapeMarkdownText, markdownToGitHub
//                                             markdown-write.ts (not in the board's parser chunk)
//   markdownToPlainText(markdown): string     readable plain text with line structure and link
//                                             URLs in parentheses. For email and webhook payloads.
//   markdownToText(source, max?): string     one line, link text only, cut at `max` with "…".
//                                             For excerpts, page descriptions and previews.
//   markdownToHtml(source): string            escaped HTML string (the RSS description)
//   safeHref(raw): string | null              the link policy, on its own
//   MARKDOWN_NOTE                             the one-line "Markdown supported" hint for forms
// The React renderer is components/portal/markdown.tsx; the server validates writes through
// markdownText() in server/validation.ts; Notion blocks are in integrations/notion-blocks.ts.

export type Inline =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 3 | 4; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  | { type: "code"; text: string };

export const MARKDOWN_NOTE =
  "Markdown supported: **bold**, *italic*, `code`, links, lists, > quotes.";

const MAX_DEPTH = 4;
const MAX_HREF = 2000;
const MAX_PAREN_DEPTH = 3;
const PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** Control characters, whitespace and invisible formatting can hide a scheme ("java\tscript:"). */
function hasHiddenChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0xfeff ||
      /\s/u.test(char)
    )
      return true;
  }
  return false;
}

/**
 * The link policy. Absolute http(s) and mailto URLs only. Returns the URL with the characters
 * that could break out of a Markdown destination or an HTML attribute percent-encoded, or null
 * when the URL is refused. The result is idempotent: safeHref(safeHref(x)) === safeHref(x).
 */
export function safeHref(raw: string): string | null {
  if (!raw || raw.length > MAX_HREF || hasHiddenChar(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!PROTOCOLS.has(url.protocol) || url.username || url.password) return null;
  if (url.protocol === "mailto:" ? !url.pathname : !url.hostname) return null;
  return raw.replace(
    /["'<>`\\()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

type Context = { steps: number };

const isSpace = (char: string | undefined) => char === undefined || /\s/u.test(char);
const isAlnum = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** Index of the closing backtick run of the same length, or -1. Stays inside [from, to). */
function findCodeEnd(source: string, from: number, to: number, length: number, ctx: Context) {
  let i = from;
  while (i < to) {
    const next = source.indexOf("`", i);
    if (next === -1 || next >= to) return -1;
    let end = next;
    while (end < to && source[end] === "`") end++;
    if (--ctx.steps < 0) return -1;
    if (end - next === length) return next;
    i = end;
  }
  return -1;
}

/** The closing delimiter run of `char` repeated `length` times, honoring escapes, code spans and nesting. */
function findEmphasisEnd(
  source: string,
  from: number,
  to: number,
  char: string,
  length: number,
  ctx: Context,
) {
  let nested = 0;
  let i = from;
  while (i < to) {
    if (--ctx.steps < 0) return -1;
    const c = source[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let end = i;
      while (end < to && source[end] === "`") end++;
      const close = findCodeEnd(source, end, to, end - i, ctx);
      i = close === -1 ? end : close + (end - i);
      continue;
    }
    if (c === char) {
      let end = i;
      while (end < to && source[end] === char) end++;
      if (end - i === length) {
        const before = source[i - 1];
        const after = end < to ? source[end] : undefined;
        const canClose = !isSpace(before) && (char === "*" || !isAlnum(after)) && i > from;
        const canOpen = !isSpace(after) && (char === "*" || !isAlnum(before));
        if (canClose && nested === 0) return i;
        if (canClose) nested--;
        else if (canOpen) nested++;
      }
      i = end;
      continue;
    }
    i++;
  }
  return -1;
}

/** `[text](url)`: returns where the link text ends and where the whole link ends, or null. */
function matchLink(source: string, open: number, to: number, ctx: Context) {
  let i = open + 1;
  for (; i < to; i++) {
    if (--ctx.steps < 0) return null;
    const c = source[i]!;
    if (c === "\\") i++;
    else if (c === "[") return null;
    else if (c === "]") break;
    else if (c === "`") {
      let end = i;
      while (end < to && source[end] === "`") end++;
      const close = findCodeEnd(source, end, to, end - i, ctx);
      i = (close === -1 ? end : close + (end - i)) - 1;
    }
  }
  if (i >= to || source[i + 1] !== "(") return null;
  const textEnd = i;
  let depth = 0;
  const limit = Math.min(to, textEnd + 2 + MAX_HREF);
  for (let j = textEnd + 2; j < limit; j++) {
    if (--ctx.steps < 0) return null;
    const c = source[j]!;
    if (c === "\\") j++;
    else if (c === "(") {
      if (++depth > MAX_PAREN_DEPTH) return null;
    } else if (c === ")") {
      if (depth === 0) return { textEnd, hrefStart: textEnd + 2, end: j + 1 };
      depth--;
    } else if (c <= " " || /\s/u.test(c)) return null;
  }
  return null;
}

function parseInlines(
  source: string,
  from: number,
  to: number,
  depth: number,
  ctx: Context,
  inLink: boolean,
): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  let i = from;
  while (i < to) {
    if (--ctx.steps < 0) {
      buffer += source.slice(i, to);
      break;
    }
    const char = source[i]!;
    if (char === "\\" && i + 1 < to && PUNCTUATION.includes(source[i + 1]!)) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }
    if (char === "`") {
      let end = i;
      while (end < to && source[end] === "`") end++;
      const length = end - i;
      const close = findCodeEnd(source, end, to, length, ctx);
      if (close === -1) {
        buffer += source.slice(i, end);
        i = end;
        continue;
      }
      let code = source.slice(end, close);
      if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) {
        code = code.slice(1, -1);
      }
      flush();
      out.push({ type: "code", text: code });
      i = close + length;
      continue;
    }
    if ((char === "*" || char === "_") && depth < MAX_DEPTH) {
      let end = i;
      while (end < to && source[end] === char) end++;
      const length = end - i;
      const before = i > from ? source[i - 1] : undefined;
      const after = end < to ? source[end] : undefined;
      const canOpen = !isSpace(after) && (char === "*" || !isAlnum(before));
      if (canOpen && length <= 3) {
        const close = findEmphasisEnd(source, end, to, char, length, ctx);
        if (close !== -1) {
          flush();
          const children = parseInlines(source, end, close, depth + 1, ctx, inLink);
          if (children.length) {
            out.push(
              length === 1
                ? { type: "em", children }
                : length === 2
                  ? { type: "strong", children }
                  : { type: "em", children: [{ type: "strong", children }] },
            );
          }
          i = close + length;
          continue;
        }
      }
      buffer += source.slice(i, end);
      i = end;
      continue;
    }
    if (char === "[" && !inLink && depth < MAX_DEPTH) {
      const match = matchLink(source, i, to, ctx);
      if (match) {
        const href = safeHref(source.slice(match.hrefStart, match.end - 1));
        const children = parseInlines(source, i + 1, match.textEnd, depth + 1, ctx, true);
        if (!href) {
          // A refused URL leaves just the link text, never the URL.
          for (const child of children) {
            if (child.type === "text") buffer += child.text;
            else {
              flush();
              out.push(child);
            }
          }
        } else {
          flush();
          out.push({
            type: "link",
            href,
            children: children.length ? children : [{ type: "text", text: href }],
          });
        }
        i = match.end;
        continue;
      }
    }
    buffer += char;
    i++;
  }
  flush();
  return out;
}

const hasContent = (nodes: Inline[]): boolean =>
  nodes.some((node) =>
    node.type === "text"
      ? node.text.trim() !== ""
      : node.type === "break"
        ? false
        : node.type === "code"
          ? true
          : hasContent(node.children),
  );

/** One line of inlines with the whitespace at its edges trimmed (spaces can surface when a link is refused). */
function parseLine(line: string, ctx: Context, trimStart: boolean): Inline[] {
  const nodes = parseInlines(line, 0, line.length, 0, ctx, false);
  while (trimStart && nodes[0]?.type === "text") {
    nodes[0].text = nodes[0].text.trimStart();
    if (nodes[0].text) break;
    nodes.shift();
  }
  while (nodes.at(-1)?.type === "text") {
    const last = nodes.at(-1) as { type: "text"; text: string };
    last.text = last.text.trimEnd();
    if (last.text) break;
    nodes.pop();
  }
  return nodes;
}

/** Lines of one block (a paragraph, a quote) as inlines, with a break between lines. */
function lineInlines(lines: string[], ctx: Context): Inline[] {
  const out: Inline[] = [];
  lines.forEach((raw, index) => {
    let line = raw.trimEnd();
    if (index === 0) line = line.trimStart();
    // An odd number of trailing backslashes ends in a CommonMark hard break.
    if (index < lines.length - 1) {
      let slashes = 0;
      while (line[line.length - 1 - slashes] === "\\") slashes++;
      if (slashes % 2 === 1 && line.slice(0, -1).trim()) line = line.slice(0, -1);
    }
    if (index > 0) out.push({ type: "break" });
    out.push(...parseLine(line, ctx, index === 0));
  });
  return out;
}

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const SKIP_CHARS =
  // oxlint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]/gu;
const ITEM = /^ {0,3}(?:([-*+])|(\d{1,9})[.)])[ \t]+(\S.*)$/u;
const FENCE = /^ {0,3}(`{3,})[^`]*$/u;
const HEADING_OPEN = /^ {0,3}(#{1,6})[ \t]+/u;
const QUOTE_OPEN = /^ {0,3}>[ \t]?/u;

/** The restricted subset as a tree. Total: any string gives a tree, in time linear in its length. */
export function parseMarkdown(source: string): Block[] {
  const clean = source
    .replace(LONE_SURROGATE, "\ufffd")
    .replace(/\r\n?/g, "\n")
    .replace(SKIP_CHARS, "");
  const lines = clean.split("\n");
  const ctx: Context = { steps: 40 * clean.length + 5000 };
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) {
      const children = lineInlines(paragraph, ctx);
      if (hasContent(children)) blocks.push({ type: "paragraph", children });
    }
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE.exec(line);
    if (fence) {
      endParagraph();
      const size = fence[1]!.length;
      const code: string[] = [];
      for (i++; i < lines.length; i++) {
        const close = /^ {0,3}(`{3,})[ \t]*$/u.exec(lines[i]!);
        if (close && close[1]!.length >= size) break;
        code.push(lines[i]!);
      }
      const text = code.join("\n");
      if (text.trim()) blocks.push({ type: "code", text });
      continue;
    }
    if (!line.trim()) {
      endParagraph();
      continue;
    }
    const heading = HEADING_OPEN.exec(line);
    if (heading) {
      endParagraph();
      let rest = line.slice(heading[0].length).trimEnd();
      let end = rest.length;
      while (end > 0 && rest[end - 1] === "#") end--;
      if (end < rest.length && (end === 0 || /[ \t]/.test(rest[end - 1]!)))
        rest = rest.slice(0, end).trimEnd();
      const children = parseLine(rest, ctx, true);
      if (hasContent(children))
        blocks.push({ type: "heading", level: heading[1]!.length <= 3 ? 3 : 4, children });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      endParagraph();
      const ordered = item[2] !== undefined;
      const start = ordered ? Number(item[2]) : 1;
      const items: Inline[][] = [];
      for (; i < lines.length; i++) {
        const next = ITEM.exec(lines[i]!);
        if (!next || (next[2] !== undefined) !== ordered) break;
        const text = next[3]!.trimEnd();
        const children = parseLine(text, ctx, true);
        if (hasContent(children)) items.push(children);
      }
      i--;
      if (items.length) blocks.push({ type: "list", ordered, start, items });
      continue;
    }
    if (QUOTE_OPEN.test(line)) {
      endParagraph();
      const quoted: string[] = [];
      for (; i < lines.length && QUOTE_OPEN.test(lines[i]!); i++)
        quoted.push(lines[i]!.replace(QUOTE_OPEN, ""));
      i--;
      const children = lineInlines(quoted, ctx);
      if (hasContent(children)) blocks.push({ type: "quote", children });
      continue;
    }
    paragraph.push(line);
  }
  endParagraph();
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Plain text and HTML.

type PlainOptions = { urls: boolean; oneLine: boolean };

function inlinePlain(nodes: Inline[], options: PlainOptions): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "break":
          return options.oneLine ? " " : "\n";
        case "link": {
          const text = inlinePlain(node.children, options);
          const shown = node.href.replace(/^mailto:/, "");
          return options.urls && text !== node.href && text !== shown ? `${text} (${shown})` : text;
        }
        default:
          return inlinePlain(node.children, options);
      }
    })
    .join("");
}

function blocksToPlain(blocks: Block[], options: PlainOptions): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "list":
          return block.items
            .map((item, index) => {
              const text = inlinePlain(item, options);
              if (options.oneLine) return text;
              return `${block.ordered ? `${block.start + index}.` : "-"} ${text}`;
            })
            .join(options.oneLine ? " " : "\n");
        case "code":
          return options.oneLine ? block.text.replace(/\s+/gu, " ") : block.text;
        default:
          return inlinePlain(block.children, options);
      }
    })
    .join(options.oneLine ? " " : "\n\n");
}

/**
 * Readable plain text: no markup, paragraphs separated by a blank line, list items on their own
 * lines, links as `text (url)`. Use it for the plain-text part of an email and for webhook
 * payloads. It accepts any string, including plain text that never was Markdown.
 */
export function markdownToPlainText(markdown: string): string {
  return blocksToPlain(parseMarkdown(markdown), { urls: true, oneLine: false }).trim();
}

/** One line of plain text (link text only), cut at `max` characters with "…". For excerpts. */
export function markdownToText(source: string, max = 160): string {
  const text = blocksToPlain(parseMarkdown(source), { urls: false, oneLine: true })
    .replace(/\s+/gu, " ")
    .trim();
  const letters = Array.from(text);
  return letters.length > max ? `${letters.slice(0, max).join("")}…` : text;
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
          return `<a href="${escapeHtml(node.href)}" rel="noopener nofollow ugc">${inlineHtml(node.children)}</a>`;
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
          return `<h${block.level}>${inlineHtml(block.children)}</h${block.level}>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
          return `<${tag}${start}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
        }
        case "quote":
          return `<blockquote>${inlineHtml(block.children)}</blockquote>`;
        case "code":
          return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
      }
    })
    .join("");
}
