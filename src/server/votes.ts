import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import type { ViewerUser, VoteResult } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { posts, votes } from "../db/schema.ts";
import { requireWriter } from "./auth.ts";
import { DomainError, invalid } from "./errors.ts";
import { enqueuePost } from "./posts.ts";
import { record, uuid } from "./validation.ts";

export async function setVoteForUser(
  input: unknown,
  viewer: ViewerUser | null,
  settings = config,
): Promise<VoteResult> {
  const writer = requireWriter(viewer, settings),
    data = record(input),
    postId = uuid(data.postId, "postId");
  if (typeof data.voted !== "boolean") invalid("voted");
  const db = createDb(env.DB),
    now = Date.now();
  if (!(await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get()))
    throw new DomainError("not_found", "Post not found.");
  const mutation = data.voted
    ? db
        .insert(votes)
        .values({ postId, userId: writer.id, createdAt: now })
        .onConflictDoNothing()
        .returning({ id: votes.postId })
    : db
        .delete(votes)
        .where(and(eq(votes.postId, postId), eq(votes.userId, writer.id)))
        .returning({ id: votes.postId });
  const [changed] = await db.batch([
    mutation,
    db
      .update(posts)
      .set({ revision: sql`${posts.revision} + 1`, updatedAt: now })
      .where(and(eq(posts.id, postId), sql`changes() > 0`)),
  ]);
  if (changed.length) enqueuePost(postId);
  const result = await db
    .select({
      votes: sql<number>`count(*)`,
      viewerHasVoted: sql<number>`coalesce(max(user_id = ${writer.id}), 0)`,
    })
    .from(votes)
    .where(eq(votes.postId, postId))
    .get();
  return { votes: result!.votes, viewerHasVoted: Boolean(result!.viewerHasVoted) };
}
