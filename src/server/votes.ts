import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import type { ViewerUser, VoteResult } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { posts, votes } from "../db/schema.ts";
import { requireWriter } from "./auth.ts";
import { DomainError, invalid } from "./errors.ts";
import type { FeedbaxConfig } from "../contracts/config.ts";
import { enqueuePost } from "./posts.ts";
import { runtimeConfig } from "./settings.ts";
import { publiclyVisible } from "./visibility.ts";
import { record, uuid } from "./validation.ts";

export async function setVoteForUser(
  input: unknown,
  viewer: ViewerUser | null,
  settings?: FeedbaxConfig,
): Promise<VoteResult> {
  const writer = requireWriter(viewer, settings ?? (await runtimeConfig())),
    data = record(input),
    postId = uuid(data.postId, "postId");
  if (typeof data.voted !== "boolean") invalid("voted");
  const db = createDb(env.DB),
    now = Date.now();
  // Votes on hidden, spam or merged posts are refused: merging moved the votes to the target.
  if (
    !(await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), publiclyVisible))
      .get())
  )
    throw new DomainError("not_found", "Post not found.");
  // The budget claim, transition, revision and enqueue lease are one D1 batch.
  // Identical requests claim nothing, even when the budget is exhausted.
  const needsChange = data.voted
    ? sql`NOT EXISTS (SELECT 1 FROM votes WHERE post_id = ${postId} AND user_id = ${writer.id})`
    : sql`EXISTS (SELECT 1 FROM votes WHERE post_id = ${postId} AND user_id = ${writer.id})`;
  const statements = [
    sql`INSERT INTO vote_budget (user_id, burst_start, burst_count, hour_start, hour_count)
        SELECT ${writer.id}, ${now}, 1, ${now}, 1 WHERE ${needsChange}
        ON CONFLICT(user_id) DO UPDATE SET
          burst_start = CASE WHEN burst_start <= ${now - 10000} THEN ${now} ELSE burst_start END,
          burst_count = CASE WHEN burst_start <= ${now - 10000} THEN 1 ELSE burst_count + 1 END,
          hour_start = CASE WHEN hour_start <= ${now - 3600000} THEN ${now} ELSE hour_start END,
          hour_count = CASE WHEN hour_start <= ${now - 3600000} THEN 1 ELSE hour_count + 1 END
        WHERE (burst_start <= ${now - 10000} OR burst_count < 10)
          AND (hour_start <= ${now - 3600000} OR hour_count < 120)
        RETURNING user_id`,
    data.voted
      ? sql`INSERT OR IGNORE INTO votes (post_id, user_id, created_at) SELECT ${postId}, ${writer.id}, ${now} WHERE changes() > 0 RETURNING post_id`
      : sql`DELETE FROM votes WHERE post_id = ${postId} AND user_id = ${writer.id} AND changes() > 0 RETURNING post_id`,
    sql`UPDATE posts SET revision = revision + 1, updated_at = ${now} WHERE id = ${postId} AND changes() > 0`,
    sql`UPDATE posts SET sync_queued_at = ${now} WHERE id = ${postId} AND changes() > 0 AND sync_queued_at <= ${now - 30000} RETURNING id`,
  ];
  const [budget, , , enqueue] = await env.DB.batch(
    statements.map((statement) => {
      const query = new SQLiteSyncDialect().sqlToQuery(statement);
      return env.DB.prepare(query.sql).bind(...query.params);
    }),
  );
  if (enqueue.results.length) enqueuePost(postId);
  const result = await db
    .select({
      votes: sql<number>`count(*)`,
      viewerHasVoted: sql<number>`coalesce(max(user_id = ${writer.id}), 0)`,
    })
    .from(votes)
    .where(eq(votes.postId, postId))
    .get();
  if (!budget.results.length && Boolean(result!.viewerHasVoted) !== data.voted)
    throw new DomainError(
      "rate_limited",
      "Too many vote changes. Try again shortly.",
      undefined,
      10,
    );
  return { votes: result!.votes, viewerHasVoted: Boolean(result!.viewerHasVoted) };
}
