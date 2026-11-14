import { env } from "cloudflare:workers";
import type { ChangelogEntry } from "../contracts/changelog.ts";
import { escapeHtml, markdownToHtml } from "../lib/markdown.ts";
import { listFeedEntries } from "./changelog.ts";
import { runtimeConfig } from "./settings.ts";

// GET /changelog.rss: RSS 2.0 of the newest published entries. Absolute URLs come from
// PORTAL_URL, never from the request, so a spoofed Host header cannot poison a feed reader.

export const FEED_CONTENT_TYPE = "application/rss+xml; charset=utf-8";
const FEED_LIMIT = 50;

/** Drops what XML 1.0 cannot carry at all: control codes, lone surrogates, U+FFFE and U+FFFF. */
function stripInvalidXml(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)
    )
      out += char;
  }
  return out;
}
export const xmlEscape = (value: string) =>
  stripInvalidXml(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function itemHtml(entry: ChangelogEntry, base: string): string {
  const shipped = entry.posts.length
    ? `<p>Shipped:</p><ul>${entry.posts
        .map(
          (post) =>
            `<li><a href="${escapeHtml(`${base}/posts/${post.id}`)}">${escapeHtml(post.title)}</a></li>`,
        )
        .join("")}</ul>`
    : "";
  return markdownToHtml(entry.body) + shipped;
}

/** The feed document. Pure: entries and the portal name in, XML out. */
export function renderFeed(entries: ChangelogEntry[], name: string, portalUrl: string): string {
  const base = portalUrl.replace(/\/$/, "");
  const updated = entries[0] ? new Date(entries[0].publishedAt).toUTCString() : null;
  const items = entries.map(
    (entry) =>
      `    <item>
      <title>${xmlEscape(entry.title)}</title>
      <link>${xmlEscape(`${base}/changelog/${entry.id}`)}</link>
      <guid isPermaLink="true">${xmlEscape(`${base}/changelog/${entry.id}`)}</guid>
      <pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>
      <description>${xmlEscape(itemHtml(entry, base))}</description>
    </item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(`${name} changelog`)}</title>
    <link>${xmlEscape(`${base}/changelog`)}</link>
    <description>${xmlEscape(`What's new in ${name}.`)}</description>
    <language>en</language>
    <atom:link href="${xmlEscape(`${base}/changelog.rss`)}" rel="self" type="application/rss+xml" />${
      updated ? `\n    <lastBuildDate>${updated}</lastBuildDate>` : ""
    }
${items.join("\n")}
  </channel>
</rss>
`;
}

export async function handleChangelogFeed(): Promise<Response> {
  const [entries, config] = await Promise.all([listFeedEntries(FEED_LIMIT), runtimeConfig()]);
  return new Response(renderFeed(entries, config.name, env.PORTAL_URL), {
    headers: {
      "Content-Type": FEED_CONTENT_TYPE,
      // Feed readers poll; a few minutes of staleness after a publish is fine.
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
