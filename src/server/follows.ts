import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import type { FollowResult, ViewerUser } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { postFollows, posts } from "../db/schema.ts";
import { DomainError, invalid } from "./errors.ts";
import { record, uuid } from "./validation.ts";
import { publiclyVisible } from "./visibility.ts";

/** Explicitly follow or unfollow a public post for status/reply email notifications. */
export async function setFollowForUser(
  input: unknown,
  viewer: ViewerUser | null,
  now = Date.now(),
): Promise<FollowResult> {
  if (!viewer || viewer.kind === "anonymous")
    throw new DomainError("unauthenticated", "Sign in to follow posts.");
  if (viewer.banned) throw new DomainError("forbidden", "Your account cannot follow posts.");
  const data = record(input),
    postId = uuid(data.postId, "postId");
  if (typeof data.following !== "boolean") invalid("following");
  const db = createDb(env.DB);
  const post = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), publiclyVisible))
    .get();
  if (!post) throw new DomainError("not_found", "Post not found.");
  const following = data.following ? 1 : 0;
  await db
    .insert(postFollows)
    .values({ postId, userId: viewer.id, following, updatedAt: now })
    .onConflictDoUpdate({
      target: [postFollows.postId, postFollows.userId],
      set: { following, updatedAt: now },
    });
  return { following: data.following };
}
