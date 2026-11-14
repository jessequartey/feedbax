import { env, waitUntil } from "cloudflare:workers";
import { and, asc, eq, sql } from "drizzle-orm";
import { notFound } from "@tanstack/react-router";
import { LIMITS } from "../contracts/domain.ts";
import type { CommentView, Page, ViewerUser } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { comments, posts, user } from "../db/schema.ts";
import { requireWriter } from "./auth.ts";
import { DomainError } from "./errors.ts";
import type { FeedbaxConfig } from "../contracts/config.ts";
import { enqueuePost } from "./posts.ts";
import { richText } from "../email/content.ts";
import { emailEnabled, queueEmailsLater } from "../email/events.ts";
import { runtimeConfig } from "./settings.ts";
import { publiclyVisible } from "./visibility.ts";
import { emitCommentCreated } from "./webhooks.ts";
import { markdownText, pageNumber, record, uuid } from "./validation.ts";

function commentView(row: {
  comment: typeof comments.$inferSelect;
  author: { id: string; name: string; isAnonymous: boolean | null };
}): CommentView {
  return {
    id: row.comment.id,
    postId: row.comment.postId,
    body: row.comment.body,
    createdAt: new Date(row.comment.createdAt).toISOString(),
    author: {
      id: row.author.id,
      name: row.author.isAnonymous ? "Anonymous" : row.author.name,
      anonymous: Boolean(row.author.isAnonymous),
    },
  };
}
const author = { id: user.id, name: user.name, isAnonymous: user.isAnonymous };
export async function addCommentForUser(
  input: unknown,
  viewer: ViewerUser | null,
  settings?: FeedbaxConfig,
): Promise<CommentView> {
  const writer = requireWriter(viewer, settings ?? (await runtimeConfig())),
    data = record(input);
  const id = uuid(data.id),
    postId = uuid(data.postId, "postId"),
    body = markdownText(data.body, LIMITS.comment, "body");
  const db = createDb(env.DB);
  async function existingComment() {
    const row = await db
      .select({ comment: comments, author })
      .from(comments)
      .innerJoin(user, eq(comments.authorId, user.id))
      .where(eq(comments.id, id))
      .get();
    if (!row) return null;
    if (row.comment.authorId !== writer.id)
      throw new DomainError("conflict", "This comment ID is already in use.");
    return commentView(row);
  }
  const replay = await existingComment();
  if (replay) return replay;
  // Hidden, spam and merged posts take no new comments: to everyone else they do not exist.
  const post = await db
    .select({ title: posts.title })
    .from(posts)
    .where(and(eq(posts.id, postId), publiclyVisible))
    .get();
  if (!post) throw new DomainError("not_found", "Post not found.");
  const now = Date.now();
  const [inserted] = await db.batch([
    db
      .insert(comments)
      .select(
        sql`SELECT ${id}, ${postId}, ${writer.id}, ${body}, ${now} WHERE (SELECT count(*) FROM comments WHERE author_id = ${writer.id} AND created_at > ${now - 3600000}) < ${LIMITS.commentsPerHour}`,
      )
      .onConflictDoNothing()
      .returning({ id: comments.id }),
    db
      .update(posts)
      .set({ revision: sql`${posts.revision} + 1`, updatedAt: now })
      .where(and(eq(posts.id, postId), sql`changes() > 0`)),
  ]);
  const comment = await existingComment();
  if (!comment)
    throw new DomainError("rate_limited", "You can submit 30 comments per hour.", undefined, 3600);
  if (inserted.length) {
    enqueuePost(postId);
    if (emailEnabled())
      queueEmailsLater([
        {
          type: "email.reply",
          id: crypto.randomUUID(),
          post: { id: postId, title: post.title },
          comment: {
            id,
            authorId: writer.id,
            authorName: comment.author.name,
            body: richText(body),
          },
        },
      ]);
    waitUntil(emitCommentCreated(comment));
  }
  return comment;
}
/**
 * `viewer` is looked up only when the post is hidden or spam, so a normal post's comments
 * stay viewer-independent. The author and admins can read the comments of their own hidden
 * post; a merged duplicate keeps its comments out of view (its page redirects).
 */
export async function listCommentPage(
  input: unknown,
  viewer: () => Promise<ViewerUser | null> = async () => null,
): Promise<Page<CommentView>> {
  const data = record(input),
    postId = uuid(data.postId, "postId"),
    page = pageNumber(data.page),
    db = createDb(env.DB),
    limit = 20;
  const post = await db
    .select({
      authorId: posts.authorId,
      hiddenAt: posts.hiddenAt,
      spam: posts.spam,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .get();
  if (!post) throw notFound();
  if (post.hiddenAt !== null || post.spam) {
    const reader = await viewer();
    if (reader?.id !== post.authorId && !reader?.admin) throw notFound();
  }
  const [rows, count] = await Promise.all([
    db
      .select({ comment: comments, author })
      .from(comments)
      .innerJoin(user, eq(comments.authorId, user.id))
      .where(eq(comments.postId, postId))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.postId, postId))
      .get(),
  ]);
  return {
    items: rows.map(commentView),
    page,
    limit,
    total: count!.count,
    hasMore: page * limit < count!.count,
  };
}
