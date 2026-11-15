import { env } from "cloudflare:workers";
import type { ChangelogEntry } from "../contracts/changelog.ts";
import { escapeHtml, markdownToHtml } from "../lib/markdown.ts";
import { listFeedEntries } from "./changelog.ts";
import { runtimeConfig } from "./settings.ts";
import { getCachedXml, setCachedXml } from "./feed-cache.ts";

export { clearFeedCache } from "./feed-cache.ts";

// GET /changelog.rss: RSS 2.0 of the newest published entries. Absolute URLs come from
// PORTAL_URL, never from the request, so a spoofed Host header cannot poison a feed reader.

export const FEED_CONTENT_TYPE = "application/rss+xml; charset=utf-8";
const FEED_LIMIT = 50;
const FEED_CACHE_CONTROL = "public, max-age=300";
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  const target = etag.replace(/^W\//, "");
  return header.split(",").some((value) => {
    const trimmed = value.trim();
    return trimmed === "*" || trimmed.replace(/^W\//, "") === target;
  });
}

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

export async function handleChangelogFeed(request?: Request): Promise<Response> {
  const [stamp, config] = await Promise.all([
    env.DB.prepare(
      `SELECT
         (SELECT count(*) FROM changelog_entries WHERE status = 'published') AS count,
         (SELECT max(updated_at) FROM changelog_entries WHERE status = 'published') AS latest,
         (SELECT max(published_at) FROM changelog_entries WHERE status = 'published') AS latest_pub,
         (SELECT id FROM changelog_entries WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT 1) AS newest_id,
         (SELECT count(*) FROM changelog_posts cp
           JOIN changelog_entries e ON e.id = cp.entry_id
           JOIN posts p ON p.id = cp.post_id
           WHERE e.status = 'published' AND p.hidden_at IS NULL AND p.spam = 0 AND p.merged_into IS NULL) AS linked_count,
         (SELECT max(p.updated_at) FROM changelog_posts cp
           JOIN changelog_entries e ON e.id = cp.entry_id
           JOIN posts p ON p.id = cp.post_id
           WHERE e.status = 'published' AND p.hidden_at IS NULL AND p.spam = 0 AND p.merged_into IS NULL) AS linked_latest`,
    ).first<{
      count: number;
      latest: number | null;
      latest_pub: number | null;
      newest_id: string | null;
      linked_count: number;
      linked_latest: number | null;
    }>(),
    runtimeConfig(),
  ]);
  const origin = env.PORTAL_URL.replace(/\/$/, "");
  const etag = `W/"rss-${stamp?.count ?? 0}-${stamp?.latest ?? 0}-${stamp?.latest_pub ?? 0}-${stamp?.newest_id ?? ""}-${stamp?.linked_count ?? 0}-${stamp?.linked_latest ?? 0}-${encodeURIComponent(config.name)}-${encodeURIComponent(origin)}"`;
  if (matchesEtag(request?.headers.get("if-none-match") ?? null, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": FEED_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  let xml = getCachedXml(env.DB, etag);
  if (xml === undefined) {
    const entries = stamp?.count ? await listFeedEntries(FEED_LIMIT) : [];
    xml = renderFeed(entries, config.name, env.PORTAL_URL);
    setCachedXml(env.DB, etag, xml);
  }
  return new Response(xml, {
    headers: {
      "Content-Type": FEED_CONTENT_TYPE,
      // Feed readers poll; a few minutes of staleness after a publish is fine.
      "Cache-Control": FEED_CACHE_CONTROL,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
