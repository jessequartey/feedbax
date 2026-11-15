import { env } from "cloudflare:workers";
import type { PortalSearchResults, SearchHit } from "../contracts/search.ts";
import { SEARCH_LIMIT, SEARCH_QUERY_LIMIT } from "../contracts/search.ts";
import { markdownToText } from "../lib/markdown.ts";
import { errorResponse } from "./http.ts";
import { text } from "./validation.ts";

/** Quote every token, so punctuation and FTS operators are always data. Prefix every word. */
export function searchExpression(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 12);
  return tokens?.length ? tokens.map((token) => `"${token}"*`).join(" AND ") : null;
}

type SearchRow = { id: string; title: string; body: string };
const hit = ({ id, title, body }: SearchRow): SearchHit => ({
  id,
  title,
  excerpt: markdownToText(body, 120),
});

/**
 * Two bounded D1 SELECTs (one per group), no session/settings reads and no external I/O.
 * Source-table visibility is checked at read time, so moderation never waits for reindexing.
 * The correlated vote count uses votes' covering primary key; no per-result D1 requests.
 */
export async function searchPortal(raw: unknown = ""): Promise<PortalSearchResults> {
  const query = text(raw, SEARCH_QUERY_LIMIT, "q", 0).trim();
  const expression = searchExpression(query);
  if (query && !expression) return { feedback: [], changelog: [] };
  const titleExpression = expression ? `title : (${expression})` : "";
  const feedback = expression
    ? env.DB.prepare(`
        SELECT p.id, p.title, p.body FROM portal_search s JOIN posts p ON p.id = s.id
        WHERE portal_search MATCH ? AND s.kind = 'feedback'
          AND p.hidden_at IS NULL AND p.spam = 0 AND p.merged_into IS NULL
        ORDER BY (s.rowid IN (SELECT rowid FROM portal_search WHERE portal_search MATCH ?)) DESC,
          bm25(portal_search, 0, 0, 10, 1),
          (SELECT count(*) FROM votes WHERE post_id = p.id) DESC,
          p.created_at DESC, p.id DESC LIMIT ?
      `).bind(expression, titleExpression, SEARCH_LIMIT)
    : env.DB.prepare(`
        SELECT p.id, p.title, p.body FROM posts p
        WHERE p.hidden_at IS NULL AND p.spam = 0 AND p.merged_into IS NULL
        ORDER BY (SELECT count(*) FROM votes WHERE post_id = p.id) DESC,
          p.created_at DESC, p.id DESC LIMIT ?
      `).bind(5);
  const changelog = expression
    ? env.DB.prepare(`
        SELECT e.id, e.title, e.body FROM portal_search s JOIN changelog_entries e ON e.id = s.id
        WHERE portal_search MATCH ? AND s.kind = 'changelog' AND e.status = 'published'
        ORDER BY (s.rowid IN (SELECT rowid FROM portal_search WHERE portal_search MATCH ?)) DESC,
          bm25(portal_search, 0, 0, 10, 1), e.published_at DESC, e.id DESC LIMIT ?
      `).bind(expression, titleExpression, SEARCH_LIMIT)
    : env.DB.prepare(`
        SELECT id, title, body FROM changelog_entries WHERE status = 'published'
        ORDER BY published_at DESC, id DESC LIMIT ?
      `).bind(3);
  const [posts, entries] = await Promise.all([
    feedback.all<SearchRow>(),
    changelog.all<SearchRow>(),
  ]);
  return { feedback: posts.results.map(hit), changelog: entries.results.map(hit) };
}

export async function handleSearch(request: Request): Promise<Response> {
  try {
    return Response.json(await searchPortal(new URL(request.url).searchParams.get("q") ?? ""), {
      // A short public cache is independent of cookies; errors are never cached.
      headers: { "Cache-Control": "public, max-age=15", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
