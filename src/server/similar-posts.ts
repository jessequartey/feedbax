import { env } from "cloudflare:workers";
import type { SuggestSimilarResult } from "../contracts/similar.ts";
import { SEARCH_QUERY_LIMIT } from "../contracts/search.ts";
import type { Category, Status } from "../contracts/domain.ts";
import { errorResponse } from "./http.ts";
import { suggestCategory, titleTokens } from "./similar-text.ts";
import { text } from "./validation.ts";

const SIMILAR_LIMIT = 3;
// Rows fetched so the overlap filter below can drop weak FTS matches and still fill three.
const SIMILAR_CANDIDATES = 10;

type SimilarRow = { id: string; title: string; status: Status; votes: number };

/** Significant title tokens, quoted and prefixed like `searchExpression`, OR-ed, title column only. */
function similarExpression(tokens: string[]): string {
  return `title : (${tokens.map((token) => `"${token}"*`).join(" OR ")})`;
}

/** A query word counts when the title has it, or a longer word it is the start of ("dar" -> "dark"). */
function sharedTokens(query: string[], title: string): number {
  const words = [...titleTokens(title)];
  return query.filter((q) =>
    words.some((word) => word === q || (q.length >= 3 && word.startsWith(q))),
  ).length;
}

/**
 * Public duplicate suggestions while typing: exactly one D1 statement, local FTS5 only.
 * No session or settings reads and no external I/O (mirrors `handleSearch` in search.ts).
 * Visibility is repeated in raw SQL, as `publiclyVisible` requires for public reads.
 * Matching on any single word is too loose, so a post needs two shared words (or the one
 * word, for a one-word title) before it is suggested.
 */
export async function suggestSimilarPosts(
  rawTitle: unknown = "",
  allowedCategories?: readonly Category[],
  d1: D1Database = env.DB,
): Promise<SuggestSimilarResult> {
  // Titles may be longer than the search limit; the first words are enough to match on.
  const title = text(
    typeof rawTitle === "string" ? rawTitle.slice(0, SEARCH_QUERY_LIMIT) : rawTitle,
    SEARCH_QUERY_LIMIT,
    "q",
    0,
  ).trim();
  if (title.length < 4) return { items: [], suggestedCategory: null };
  const suggestedCategory = suggestCategory(title, allowedCategories);
  const tokens = [...titleTokens(title)].slice(0, 8);
  if (!tokens.length) return { items: [], suggestedCategory };
  const { results } = await d1
    .prepare(
      `SELECT p.id, p.title, p.status,
              (SELECT count(*) FROM votes WHERE post_id = p.id) AS votes
       FROM portal_search s JOIN posts p ON p.id = s.id
       WHERE portal_search MATCH ? AND s.kind = 'feedback'
         AND p.hidden_at IS NULL AND p.spam = 0 AND p.merged_into IS NULL
       ORDER BY bm25(portal_search, 0, 0, 10, 1), votes DESC, p.created_at DESC, p.id DESC
       LIMIT ?`,
    )
    .bind(similarExpression(tokens), SIMILAR_CANDIDATES)
    .all<SimilarRow>();
  const needed = Math.min(2, tokens.length);
  return {
    items: results
      .filter((row) => sharedTokens(tokens, row.title) >= needed)
      .slice(0, SIMILAR_LIMIT)
      .map((row) => ({ ...row, votes: Number(row.votes ?? 0) })),
    suggestedCategory,
  };
}

export async function handleSearchSimilar(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await suggestSimilarPosts(query), {
      headers: { "Cache-Control": "public, max-age=15", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
