import type { RichText } from "../contracts/sync.ts";
import { escapeHtml, markdownToPlainText } from "../lib/markdown.ts";

// How user-written text reaches an email. A body travels in the queue as its stored Markdown
// plus a plain-text version, and is shown in the email as escaped plain text: never as HTML
// built from user content, so a body cannot inject markup, links or tracking pixels.

export { escapeHtml };

export function richText(markdown: string): RichText {
  return { markdown, text: markdownToPlainText(markdown) };
}

/** Body HTML: escaped plain text, blank lines become paragraphs, newlines become <br>. */
export function textHtml(text: string, style = ""): string {
  const attr = style ? ` style="${escapeHtml(style)}"` : "";
  return text
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((part) => `<p${attr}>${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

/** A one-line excerpt of at most `max` characters. */
export function excerpt(text: string, max = 280): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** Text cut at `max` characters on a word boundary, keeping its line breaks. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.search(/\s\S*$/);
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
