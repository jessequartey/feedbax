import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
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

export async function watermark(provider: "notion" | "github", until: string): Promise<void> {
  const value = JSON.stringify(until);
  await db()
    .insert(syncState)
    .values({ key: `${provider}.watermark`, value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: Date.now() },
      setWhere: sql`${syncState.value} < ${value}`,
    });
}

export function providerRequest(provider: "notion" | "github") {
  return createProviderRequest(
    provider,
    provider === "notion" ? env.NOTION_TOKEN : (env.GITHUB_TOKEN ?? ""),
    fetch,
    async () => {
      await db()
        .delete(syncState)
        .where(eq(syncState.key, `${provider}.error`));
    },
  );
}

export async function providerPaused(provider: "notion" | "github", now: number): Promise<boolean> {
  const error = await readState<SyncErrorState>(`${provider}.error`);
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
