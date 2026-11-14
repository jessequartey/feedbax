import { sql } from "drizzle-orm";
import { markdownToText } from "../lib/markdown.ts";
import { posts } from "../db/schema.ts";

// Bodies are stored as Markdown (src/lib/markdown.ts). Lists show a plain-text excerpt and
// search matches the text a reader sees, not the markup.

/** One line of plain text from a stored body. Only the head is parsed: an excerpt never needs more. */
export function excerptOf(body: string, max: number): string {
  return markdownToText(body.slice(0, max * 12), max);
}

/** The characters the stored form adds around text: escapes, emphasis marks and code ticks. */
const MARKUP = /[\\*`]/g;

/** The user's search words as they appear in `plainBodySql` (null when nothing is left). */
export function plainQuery(q: string): string | null {
  const plain = q.replace(MARKUP, "").trim();
  return plain || null;
}

/**
 * The stored body with backslash escapes, `*` emphasis marks and backticks removed, so that
 * "really slow" finds "**really** slow" and "[WIP]" finds "\[WIP\]". There is no separate
 * plain-text column: a migration for this alone would clash with the other 0.3.1 schema work.
 */
export const plainBodySql = sql`replace(replace(replace(${posts.body}, char(92), ''), '*', ''), char(96), '')`;
