import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../db/client.ts";
import { changelogEntries, changelogPosts, posts } from "../db/schema.ts";
import { escapeMarkdownText } from "../lib/markdown-write.ts";
import { excerptOf } from "./excerpt.ts";
import { readSettings } from "./settings.ts";

// Auto-draft for sync (src/sync/): kept apart from changelog.ts so the queue consumer does not
// pull in the router. Nothing here is reachable from a request.

/**
 * The post excerpt a draft starts from: the post as one line of plain text, at most 280
 * characters, written back as Markdown (so the draft shows the same words, never formatting).
 */
export function draftExcerpt(body: string): string {
  return escapeMarkdownText(excerptOf(body, 280));
}

/**
 * Statements that draft "Shipped: <title>" for posts that just became Done. Sync adds them to
 * the same D1 batch as the status update, so a retry can never see "done but not drafted".
 *
 * Idempotent in SQL, not in JS: the entry is inserted only if no entry links the post yet,
 * and the link only if that entry was inserted, so repeated Done transitions, sync retries
 * and a Notion + GitHub double close all leave exactly one draft. Hidden, spam and merged
 * posts and posts that are not Done at that point in the batch get none. Returns [] when the
 * `changelog.autoDraft` setting is off.
 */
export async function autoDraftStatements(
  db: Db,
  done: { id: string; body: string }[],
  now = Date.now(),
  d1: D1Database = env.DB,
): Promise<BatchItem<"sqlite">[]> {
  if (!done.length) return [];
  const settings = (await readSettings(d1)).changelog;
  if (!settings.autoDraft || settings.source === "github") return [];
  return done.flatMap(({ id: postId, body }) => {
    const entryId = crypto.randomUUID();
    return [
      db
        .insert(changelogEntries)
        .select(
          sql`SELECT ${entryId}, 'Shipped: ' || ${posts.title}, ${draftExcerpt(body)}, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, ${now}, ${now} FROM ${posts} WHERE ${posts.id} = ${postId} AND ${posts.status} = 'done' AND ${posts.hiddenAt} IS NULL AND ${posts.spam} = 0 AND ${posts.mergedInto} IS NULL AND NOT EXISTS (SELECT 1 FROM ${changelogPosts} WHERE ${changelogPosts.postId} = ${postId})`,
        ),
      db
        .insert(changelogPosts)
        .select(
          sql`SELECT ${entryId}, ${postId} WHERE EXISTS (SELECT 1 FROM ${changelogEntries} WHERE ${changelogEntries.id} = ${entryId})`,
        )
        .onConflictDoNothing(),
    ] as BatchItem<"sqlite">[];
  });
}
