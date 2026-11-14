import type { RichText } from "../contracts/sync.ts";

// The one conversion point for user-written bodies leaving the portal (email now, webhooks
// in 08). Post and comment bodies are plain text today; ticket 13 makes them a restricted
// Markdown subset. When it lands, swap `plainText` for its Markdown → text conversion and
// `richTextHtml` for its safe renderer. Nothing else in email needs to change, and no raw
// HTML from user content is ever emitted.

export type { RichText };

/** Markdown source → plain text. TODO(0.4.0-13): strip the subset's syntax here. */
export function plainText(markdown: string): string {
  return markdown.replaceAll("\r\n", "\n").trim();
}

export function richText(markdown: string): RichText {
  return { markdown, text: plainText(markdown) };
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/**
 * Body HTML for an email: escaped plain text, blank lines → paragraphs, newlines → <br>.
 * TODO(0.4.0-13): render `value.markdown` with the shared safe renderer instead.
 */
export function richTextHtml(value: RichText, style = ""): string {
  const attr = style ? ` style="${escapeHtml(style)}"` : "";
  return value.text
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((part) => `<p${attr}>${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

/** A one-line plain-text excerpt of at most `max` characters. */
export function excerpt(text: string, max = 280): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}
