import { env } from "cloudflare:workers";
import { and, eq, or, sql } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import { createDb } from "../db/client.ts";
import { posts, images, user, syncState } from "../db/schema.ts";
import type { SyncErrorState } from "../contracts/sync.ts";
import { createProviderRequest } from "../integrations/request.ts";

export { env, config, posts };
export const db = () => createDb(env.DB);

export async function readState<T>(key: string): Promise<T | null> {
  const row = await db().select().from(syncState).where(eq(syncState.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function writeState(key: string, value: unknown): Promise<void> {
  await db()
    .insert(syncState)
    .values({ key, value: JSON.stringify(value), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value: JSON.stringify(value), updatedAt: Date.now() },
    });
}

/** Upsert an ISO time that only ever moves forward (watermarks and backoff). */
export async function advanceState(key: string, iso: string): Promise<void> {
  const value = JSON.stringify(iso);
  await db()
    .insert(syncState)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: Date.now() },
      setWhere: sql`${syncState.value} < ${value}`,
    });
}

export async function watermark(provider: "notion" | "github", until: string): Promise<void> {
  await advanceState(`${provider}.watermark`, until);
}

/**
 * A permanent failure of a post write (403/404/400 on `notion.post` or `github.issue`) is
 * "sticky": a successful read-only poll does not prove writes work, so it must not clear the
 * error (and so unpause the sweep every tick). Auth errors are about the token, which any
 * successful call proves.
 */
const notSticky = sql`coalesce(json_extract(${syncState.value}, '$.type'), '') NOT IN ('notion.post', 'github.issue') OR coalesce(json_extract(${syncState.value}, '$.code'), '') = 'auth'`;

/**
 * `scope` is the kind of message making the calls. The first successful call of a message
 * clears the provider's transient backoff and its error entry (a poll leaves sticky post-write
 * errors in place). One clear per message keeps idle polls to a single D1 statement.
 */
export function providerRequest(provider: "notion" | "github", scope: "post" | "poll" = "post") {
  let cleared = false;
  return createProviderRequest(
    provider,
    provider === "notion" ? env.NOTION_TOKEN : (env.GITHUB_TOKEN ?? ""),
    fetch,
    async () => {
      if (cleared) return;
      cleared = true;
      const error = eq(syncState.key, `${provider}.error`);
      await db()
        .delete(syncState)
        .where(
          or(
            eq(syncState.key, `${provider}.backoff`),
            scope === "post" ? error : and(error, notSticky),
          ),
        );
    },
  );
}

export function providerPaused(error: SyncErrorState | null | undefined, now: number): boolean {
  return (
    !!error &&
    !["transient", "rate_limit"].includes(error.code) &&
    now - Date.parse(error.at) < 3_600_000
  );
}

export async function readPost(postId: string) {
  const database = db();
  const post = await database
    .select({
      post: posts,
      authorName: user.name,
      anonymous: user.isAnonymous,
      votes: sql<number>`(select count(*) from votes where votes.post_id = ${posts.id})`,
      comments: sql<number>`(select count(*) from comments where comments.post_id = ${posts.id})`,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .where(eq(posts.id, postId))
    .get();
  if (!post) return null;
  const attached = await database
    .select()
    .from(images)
    .where(eq(images.postId, postId))
    .orderBy(images.position);
  return {
    ...post.post,
    author: post.anonymous ? "Anonymous" : post.authorName,
    votes: post.votes,
    comments: post.comments,
    images: attached,
  };
}
export type SyncPost = NonNullable<Awaited<ReturnType<typeof readPost>>>;
export const portalUrl = () => env.PORTAL_URL.replace(/\/$/, "");
