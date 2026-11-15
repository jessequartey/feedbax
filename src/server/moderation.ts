import { env } from "cloudflare:workers";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import type {
  DeletePostResult,
  MergeCandidate,
  ModerationComment,
  ModerationFilter,
  ModerationPost,
  ModerationPostPage,
  PostState,
} from "../contracts/admin.ts";
import type { Page } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { changelogPosts, comments, images, posts, user, votes } from "../db/schema.ts";
import { DomainError, invalid } from "./errors.ts";
import { pageNumber, record, text, uuid } from "./validation.ts";
import { excerptOf } from "./excerpt.ts";
import { isPublicPost, publiclyVisible } from "./visibility.ts";

// Moderation actions. Callers must already have passed `requireAdmin` (admin-api.ts): these
// functions trust their caller, like saveSettings. Hide, spam and merge never delete data;
// only deletePost does.

const PAGE_SIZE = 20;
const authorFields = { id: user.id, name: user.name, isAnonymous: user.isAnonymous };
const author = (row: { id: string; name: string; isAnonymous: boolean | null }) => ({
  id: row.id,
  name: row.isAnonymous ? "Anonymous" : row.name,
  anonymous: Boolean(row.isAnonymous),
});
const postState = (row: { hiddenAt: number | null; spam: number }): PostState =>
  row.spam ? "spam" : row.hiddenAt !== null ? "hidden" : "visible";
const iso = (ms: number) => new Date(ms).toISOString();

export function moderationFilter(value: unknown): ModerationFilter {
  if (value === undefined) return "all";
  if (value === "all" || value === "hidden" || value === "spam") return value;
  return invalid("filter");
}

/** Newest first. "hidden" is hidden and not spam; "spam" is every spam-flagged post. */
export async function listModerationPosts(input: unknown): Promise<ModerationPostPage> {
  const data = record(input),
    filter = moderationFilter(data.filter),
    page = pageNumber(data.page),
    db = createDb(env.DB);
  if (data.sort !== undefined && data.sort !== "new" && data.sort !== "priority") invalid("sort");
  const where =
    filter === "hidden"
      ? and(isNotNull(posts.hiddenAt), eq(posts.spam, 0))
      : filter === "spam"
        ? eq(posts.spam, 1)
        : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        post: posts,
        author: authorFields,
        votes: sql<number>`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`.mapWith(
          Number,
        ),
        comments: sql<number>`(SELECT count(*) FROM comments WHERE post_id = ${posts.id})`.mapWith(
          Number,
        ),
      })
      .from(posts)
      .innerJoin(user, eq(posts.authorId, user.id))
      .where(where)
      .orderBy(
        ...(data.sort === "priority" ? [desc(posts.priority)] : []),
        desc(posts.createdAt),
        desc(posts.id),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(where)
      .get(),
  ]);
  const items = rows.map((row): ModerationPost => {
    return {
      priority: row.post.priority,
      id: row.post.id,
      title: row.post.title,
      excerpt: excerptOf(row.post.body, 160),
      category: row.post.category,
      status: row.post.status,
      author: author(row.author),
      votes: row.votes,
      comments: row.comments,
      createdAt: iso(row.post.createdAt),
      state: postState(row.post),
      moderationReason: row.post.moderationReason,
      mergedInto: row.post.mergedInto,
      githubUrl: row.post.githubUrl,
      githubRequested: Boolean(row.post.githubRequested),
    };
  });
  return {
    items,
    page,
    limit: PAGE_SIZE,
    total: total!.count,
    hasMore: page * PAGE_SIZE < total!.count,
    githubEnabled: Boolean(config.integrations.github),
  };
}

export async function listModerationComments(input: unknown): Promise<Page<ModerationComment>> {
  const data = record(input),
    page = pageNumber(data.page),
    db = createDb(env.DB);
  const [rows, total] = await Promise.all([
    db
      .select({ comment: comments, postTitle: posts.title, author: authorFields })
      .from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .innerJoin(user, eq(comments.authorId, user.id))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .get(),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.comment.id,
      postId: row.comment.postId,
      postTitle: row.postTitle,
      body: row.comment.body,
      hidden: row.comment.hiddenAt !== null,
      moderationReason: row.comment.moderationReason,
      author: author(row.author),
      createdAt: iso(row.comment.createdAt),
    })),
    page,
    limit: PAGE_SIZE,
    total: total!.count,
    hasMore: page * PAGE_SIZE < total!.count,
  };
}

async function findPost(id: string) {
  const row = await createDb(env.DB).select().from(posts).where(eq(posts.id, id)).get();
  if (!row) throw new DomainError("not_found", "Post not found.");
  return row;
}

/** One UPDATE (no external I/O); the existing cron outbox retries the Notion mirror. */
export async function setPostPriority(
  input: unknown,
  now = Date.now(),
): Promise<{ priority: number | null }> {
  const data = record(input),
    postId = uuid(data.postId, "postId");
  const priority = data.priority;
  if (
    priority !== null &&
    (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 100)
  )
    invalid("priority");
  const rows = await createDb(env.DB)
    .update(posts)
    .set({
      priority,
      priorityUpdatedAt: now,
      updatedAt: now,
      revision: sql`${posts.revision} + 1`,
    })
    .where(eq(posts.id, postId))
    .returning({ id: posts.id });
  if (!rows.length) throw new DomainError("not_found", "Post not found.");
  return { priority };
}

/** Hide, mark spam, or restore. Restoring clears both flags. Nothing is deleted. */
export async function setPostState(input: unknown, now = Date.now()): Promise<PostState> {
  const data = record(input),
    postId = uuid(data.postId, "postId");
  if (data.state !== "visible" && data.state !== "hidden" && data.state !== "spam")
    invalid("state");
  const state = data.state;
  const post = await findPost(postId);
  await createDb(env.DB)
    .update(posts)
    .set({
      ...(state === "visible"
        ? { hiddenAt: null, spam: 0, moderationReason: null }
        : { hiddenAt: post.hiddenAt ?? now, spam: state === "spam" ? 1 : 0 }),
      revision: sql`${posts.revision} + 1`,
      updatedAt: now,
    })
    .where(eq(posts.id, postId));
  await env.SYNC_QUEUE.send({ type: "notion.post", postId }).catch(() => undefined);
  return state;
}

/**
 * Merge a duplicate into `target`. Its votes move to the target (one per user: a person who
 * voted for both counts once), the duplicate is marked `merged_into` and redirects to the
 * target, and any post already merged into the duplicate is repointed. The duplicate's
 * comments stay with it. The target must be visible, so a chain never forms.
 */
export async function mergePost(input: unknown, now = Date.now()): Promise<{ targetId: string }> {
  const data = record(input),
    sourceId = uuid(data.sourceId, "sourceId"),
    targetId = uuid(data.targetId, "targetId");
  if (sourceId === targetId) invalid("targetId");
  const source = await findPost(sourceId),
    target = await findPost(targetId);
  if (source.mergedInto) throw new DomainError("conflict", "This post was already merged.");
  if (target.mergedInto || target.hiddenAt !== null || target.spam)
    throw new DomainError("conflict", "Pick a visible post that is not itself a duplicate.");
  const db = createDb(env.DB);
  await db.batch([
    db
      .insert(votes)
      .select(
        db
          .select({
            postId: sql<string>`${targetId}`.as("post_id"),
            userId: votes.userId,
            createdAt: votes.createdAt,
          })
          .from(votes)
          .where(eq(votes.postId, sourceId)),
      )
      .onConflictDoNothing(),
    db.delete(votes).where(eq(votes.postId, sourceId)),
    // Revisions bump so the cron re-mirrors both posts (vote counts) to Notion.
    db
      .update(posts)
      .set({ mergedInto: targetId, revision: sql`${posts.revision} + 1`, updatedAt: now })
      .where(eq(posts.id, sourceId)),
    db.update(posts).set({ mergedInto: targetId }).where(eq(posts.mergedInto, sourceId)),
    db
      .update(posts)
      .set({ revision: sql`${posts.revision} + 1`, updatedAt: now })
      .where(eq(posts.id, targetId)),
  ]);
  await env.SYNC_QUEUE.send({ type: "notion.post", postId: sourceId }).catch(() => undefined);
  return { targetId };
}

/** Visible posts matching `q`, for the merge picker. */
export async function searchMergeTargets(input: unknown): Promise<MergeCandidate[]> {
  const data = record(input),
    exclude = uuid(data.excludeId, "excludeId"),
    q = text(data.q ?? "", 100, "q", 0).trim();
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await createDb(env.DB)
    .select({
      id: posts.id,
      title: posts.title,
      createdAt: posts.createdAt,
      votes: sql<number>`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`.mapWith(Number),
    })
    .from(posts)
    .where(
      and(
        publiclyVisible,
        ne(posts.id, exclude),
        q ? sql`${posts.title} LIKE ${pattern} ESCAPE ${"\\"}` : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(8);
  return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) }));
}

/**
 * Hard delete: the post, its comments, votes and images (D1 rows and R2 objects), and its
 * Notion row (archived through the sync queue: `notion.archive`). R2 goes first so a failure
 * leaves a live post that can be deleted again, never orphaned private images. Duplicates
 * that were merged into the post become hidden instead of reappearing.
 */
export async function deletePost(input: unknown, now = Date.now()): Promise<DeletePostResult> {
  const postId = uuid(record(input).postId, "postId");
  const post = await findPost(postId);
  const db = createDb(env.DB);
  const attached = await db
    .select({ objectKey: images.objectKey })
    .from(images)
    .where(eq(images.postId, postId));
  if (attached.length) await env.IMAGES.delete(attached.map((image) => image.objectKey));
  await db.batch([
    db
      .update(posts)
      .set({ mergedInto: null, hiddenAt: sql`coalesce(${posts.hiddenAt}, ${now})` })
      .where(eq(posts.mergedInto, postId)),
    db.delete(votes).where(eq(votes.postId, postId)),
    db.delete(comments).where(eq(comments.postId, postId)),
    db.delete(images).where(eq(images.postId, postId)),
    db.delete(changelogPosts).where(eq(changelogPosts.postId, postId)),
    db.delete(posts).where(eq(posts.id, postId)),
  ]);
  if (!post.notionPageId) return { notion: "none" };
  // The post is gone, so the cron cannot retry this; try the queue twice before reporting it.
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      await env.SYNC_QUEUE.send({ type: "notion.archive", pageId: post.notionPageId });
      return { notion: "queued" };
    } catch {
      // try once more
    }
  return { notion: "failed" };
}

export async function deleteComment(input: unknown): Promise<{ postId: string }> {
  const commentId = uuid(record(input).commentId, "commentId"),
    db = createDb(env.DB);
  const found = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .get();
  if (!found) throw new DomainError("not_found", "Comment not found.");
  await db.batch([
    db.delete(comments).where(eq(comments.id, commentId)),
    // The comment count is mirrored to Notion: bump the revision so the cron refreshes it.
    db
      .update(posts)
      .set({ revision: sql`${posts.revision} + 1`, updatedAt: Date.now() })
      .where(eq(posts.id, found.postId)),
  ]);
  return { postId: found.postId };
}

/**
 * The same path as ticking "Send to GitHub" in Notion (sync/notion.ts pollNotion): mark the
 * post requested and enqueue `github.issue`. createIssue is idempotent, so a post is never
 * given two issues, and the cron sweep re-sends it if this enqueue is lost.
 */
export async function sendToGitHub(input: unknown): Promise<{ queued: true }> {
  const postId = uuid(record(input).postId, "postId");
  if (!config.integrations.github)
    throw new DomainError("conflict", "GitHub sync is not enabled for this portal.");
  const post = await findPost(postId);
  if (!isPublicPost(post))
    throw new DomainError("conflict", "Only public posts can be sent to GitHub.");
  if (post.githubNumber !== null)
    throw new DomainError("conflict", "This post already has a GitHub issue.");
  const requested = await createDb(env.DB)
    .update(posts)
    .set({ githubRequested: 1 })
    .where(and(eq(posts.id, postId), publiclyVisible))
    .returning({ id: posts.id });
  if (!requested.length)
    throw new DomainError("conflict", "Only public posts can be sent to GitHub.");
  await env.SYNC_QUEUE.send({ type: "github.issue", postId }).catch(() => undefined);
  return { queued: true };
}

/** Release a held comment. Approval uses the same server-side admin gate as deletion. */
export async function approveComment(input: unknown): Promise<{ postId: string }> {
  const id = uuid(record(input).commentId, "commentId"),
    db = createDb(env.DB);
  const found = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, id))
    .get();
  if (!found) throw new DomainError("not_found", "Comment not found.");
  const [released] = await db.batch([
    db
      .update(comments)
      .set({ hiddenAt: null, moderationReason: null })
      .where(and(eq(comments.id, id), isNotNull(comments.hiddenAt)))
      .returning({ id: comments.id }),
    db
      .update(posts)
      .set({ revision: sql`${posts.revision} + 1`, updatedAt: Date.now() })
      .where(and(eq(posts.id, found.postId), sql`changes() > 0`)),
  ]);
  // The Notion mirror shows the comment count; the cron sweep would catch up otherwise.
  if (released.length)
    await env.SYNC_QUEUE.send({ type: "notion.post", postId: found.postId }).catch(() => undefined);
  return { postId: found.postId };
}
