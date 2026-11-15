import { moderateContent } from "./content-moderation.ts";
import { env, waitUntil } from "cloudflare:workers";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "@tanstack/react-router";
import { LIMITS } from "../contracts/domain.ts";
import type {
  ListPostsInput,
  Page,
  PostDetail,
  PostSummary,
  ViewerUser,
} from "../contracts/domain.ts";
import type { FeedbaxConfig } from "../contracts/config.ts";
import { createDb } from "../db/client.ts";
import { images, postFollows, posts, user } from "../db/schema.ts";
import { DomainError, invalid } from "./errors.ts";
import { category, listInput, markdownText, text, uuid } from "./validation.ts";
import { requireAdmin, requireWriter } from "./auth.ts";
import { storeImage, validateImage } from "./images.ts";
import { parseShippedIn, shippedInField } from "./changelog.ts";
import { effectiveSettings, runtimeConfig } from "./settings.ts";
import { MAX_MERGE_DEPTH, publiclyVisible } from "./visibility.ts";
import { emitPostCreated } from "./webhooks.ts";
import { excerptOf, plainBodySql, plainQuery } from "./excerpt.ts";

export function enqueuePost(postId: string) {
  waitUntil(env.SYNC_QUEUE.send({ type: "notion.post", postId }).catch(() => undefined));
}
export async function createPostForUser(
  value: unknown,
  viewer: ViewerUser | null,
  settings?: FeedbaxConfig,
) {
  // The anonymous switch can be overridden at runtime (/admin/settings), so decide from the
  // effective config unless the caller (a test, the bearer API) pins one.
  const writer = requireWriter(viewer, settings ?? (await runtimeConfig()));
  if (!(value instanceof FormData)) invalid();
  for (const key of ["id", "title", "body", "category"])
    if (value.getAll(key).length !== 1) invalid(key);
  for (const key of value.keys())
    if (!["id", "title", "body", "category", "image"].includes(key)) invalid(key);
  const id = uuid(value.get("id"));
  const title = text(value.get("title"), LIMITS.title, "title");
  const body = markdownText(value.get("body"), LIMITS.body, "body");
  const kind = category(value.get("category"));
  if (!(await effectiveSettings()).categories.includes(kind)) invalid("category");
  const files = value.getAll("image");
  if (files.length > LIMITS.images)
    throw new DomainError("too_large", "Attach at most 3 images.", "image");
  if (files.some((file) => !(file instanceof File))) invalid("image");
  const validated = await Promise.all((files as File[]).map(validateImage));
  const db = createDb(env.DB);
  const response = (status: number, heldForReview = false) => ({
    status,
    data: {
      postId: id,
      postUrl: `${env.PORTAL_URL.replace(/\/$/, "")}/posts/${id}`,
      ...(heldForReview ? { heldForReview: true } : {}),
    },
  });
  const replay = await db.select().from(posts).where(eq(posts.id, id)).get();
  if (replay) {
    if (replay.authorId !== writer.id)
      throw new DomainError("conflict", "This post ID is already in use.");
    return response(200, replay.hiddenAt !== null && replay.moderationReason !== null);
  }
  const flagged = await moderateContent(`${title}\n${body}`, writer);
  const now = Date.now(),
    since = now - 3_600_000;
  const quota = await db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .where(and(eq(posts.authorId, writer.id), sql`${posts.createdAt} > ${since}`))
    .get();
  if (quota!.count >= LIMITS.postsPerHour)
    throw new DomainError("rate_limited", "You can submit 5 posts per hour.", undefined, 3600);
  const attachments = await Promise.all(
    validated.map((image, i) => storeImage(image, id, i, writer.id)),
  );
  // The quota predicate is in the INSERT too, so concurrent requests cannot exceed it.
  // Drizzle lists every `posts` column in schema order: a new column needs a value here
  // (including moderation state, reason, and nullable priority fields).
  const insert = db
    .insert(posts)
    .select(
      sql`SELECT ${id}, ${writer.id}, ${title}, ${body}, ${kind}, 'open', ${now}, ${now}, 1, NULL, 0, 0, 0, NULL, NULL, NULL, 0, NULL, ${flagged ? now : null}, 0, ${flagged ? "profanity" : null}, NULL, NULL, NULL, NULL WHERE (SELECT count(*) FROM posts WHERE author_id = ${writer.id} AND created_at > ${since}) < ${LIMITS.postsPerHour}`,
    )
    .onConflictDoNothing()
    .returning({ id: posts.id });
  const operations = attachments.map((image) =>
    db
      .insert(images)
      .select(
        sql`SELECT ${image.id}, ${id}, ${image.position}, ${image.objectKey}, ${image.mime}, ${image.bytes}, ${image.width}, ${image.height}, ${now} WHERE changes() > 0 AND EXISTS (SELECT 1 FROM posts WHERE id = ${id} AND author_id = ${writer.id})`,
      )
      .onConflictDoNothing(),
  );
  const [inserted] = await db.batch([insert, ...operations]);
  if (!inserted.length) {
    const existing = await db.select().from(posts).where(eq(posts.id, id)).get();
    if (!existing)
      throw new DomainError("rate_limited", "You can submit 5 posts per hour.", undefined, 3600);
    if (existing.authorId !== writer.id)
      throw new DomainError("conflict", "This post ID is already in use.");
    return response(200, existing.hiddenAt !== null && existing.moderationReason !== null);
  }
  if (writer.kind !== "anonymous")
    await db
      .insert(postFollows)
      .values({ postId: id, userId: writer.id, following: 1, updatedAt: now })
      .onConflictDoNothing();
  // A held post stays out of Notion and webhooks until an admin makes it visible.
  if (!flagged) {
    enqueuePost(id);
    waitUntil(emitPostCreated(id));
  }
  return response(201, flagged);
}
function counts(viewer: ViewerUser | null) {
  return {
    votes: sql<number>`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`
      .mapWith(Number)
      .as("vote_count"),
    comments:
      sql<number>`(SELECT count(*) FROM comments WHERE post_id = ${posts.id} AND hidden_at IS NULL)`
        .mapWith(Number)
        .as("comment_count"),
    viewerHasVoted:
      sql<number>`EXISTS (SELECT 1 FROM votes WHERE post_id = ${posts.id} AND user_id = ${viewer?.id ?? ""})`
        .mapWith(Boolean)
        .as("viewer_has_voted"),
  };
}
function summary(row: {
  post: typeof posts.$inferSelect;
  author: { id: string; name: string; isAnonymous: boolean | null };
  votes: number;
  comments: number;
  viewerHasVoted: boolean;
}): PostSummary {
  return {
    id: row.post.id,
    title: row.post.title,
    excerpt: excerptOf(row.post.body, 180),
    category: row.post.category,
    status: row.post.status,
    author: {
      id: row.author.id,
      name: row.author.isAnonymous ? "Anonymous" : row.author.name,
      anonymous: Boolean(row.author.isAnonymous),
    },
    votes: row.votes,
    comments: row.comments,
    viewerHasVoted: Boolean(row.viewerHasVoted),
    createdAt: new Date(row.post.createdAt).toISOString(),
    updatedAt: new Date(row.post.updatedAt).toISOString(),
    // Only the author's own lists can hold a moderated post, so the flag is rare.
    ...(row.post.hiddenAt !== null || row.post.spam ? { hidden: true as const } : {}),
  };
}
const authorFields = {
  id: sql<string>`${user.id}`.as("author_id_col"),
  name: sql<string>`${user.name}`.as("author_name_col"),
  isAnonymous: sql<boolean | null>`${user.isAnonymous}`.as("author_anon_col"),
};
export async function listPostPage(
  input: ListPostsInput,
  viewer: ViewerUser | null,
  mine = false,
): Promise<Page<PostSummary>> {
  const data = listInput(input),
    db = createDb(env.DB);
  if (data.sort === "priority") requireAdmin(viewer);
  if (mine && !viewer)
    return { items: [], page: data.page, limit: data.limit, total: 0, hasMore: false };
  const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
  const pattern = like(data.q ?? "");
  const plain = data.q ? plainQuery(data.q) : null;
  const where = and(
    // The public board, roadmap and search never show hidden, spam or merged posts, and their
    // totals never count them. "My feedback" is the author's own view: everything they wrote.
    mine ? eq(posts.authorId, viewer!.id) : publiclyVisible,
    data.category ? eq(posts.category, data.category) : undefined,
    data.status ? eq(posts.status, data.status) : undefined,
    data.q
      ? sql`(${posts.title} LIKE ${pattern} ESCAPE ${"\\"}${plain ? sql` OR ${plainBodySql} LIKE ${like(plain)} ESCAPE ${"\\"}` : sql``})`
      : undefined,
  );
  const windowStart = Date.now() - 7 * 86400000;
  const voteOrder =
    data.sort === "top"
      ? sql`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`
      : sql`(SELECT coalesce(sum(604800000 + created_at - ${windowStart}), 0) FROM votes WHERE post_id = ${posts.id} AND created_at >= ${windowStart})`;
  const order = [
    ...(data.sort === "priority"
      ? [desc(posts.priority)]
      : data.sort === "new"
        ? []
        : [desc(voteOrder)]),
    desc(posts.createdAt),
    desc(posts.id),
  ];
  const [rows, totals] = await db.batch([
    db
      .select({ post: posts, author: authorFields, ...counts(viewer) })
      .from(posts)
      .innerJoin(user, eq(posts.authorId, user.id))
      .where(where)
      .orderBy(...order)
      .limit(data.limit)
      .offset((data.page - 1) * data.limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(where),
  ]);
  const total = totals[0]!.count;
  return {
    items: rows.map(summary),
    page: data.page,
    limit: data.limit,
    total,
    hasMore: data.page * data.limit < total,
  };
}
/** The post a duplicate finally points at. Merges repoint chains, so this is one hop in practice. */
async function mergeTarget(id: string): Promise<string> {
  const db = createDb(env.DB);
  let current = id;
  for (let depth = 0; depth < MAX_MERGE_DEPTH; depth++) {
    const next = await db
      .select({ mergedInto: posts.mergedInto })
      .from(posts)
      .where(eq(posts.id, current))
      .get();
    if (!next?.mergedInto) break;
    current = next.mergedInto;
  }
  return current;
}
export async function getPostDetail(id: string, viewer: ViewerUser | null): Promise<PostDetail> {
  uuid(id);
  const db = createDb(env.DB);
  const followerId = viewer && viewer.kind !== "anonymous" ? viewer.id : null;
  const viewerIsFollowing = followerId
    ? sql<number>`coalesce(
        (SELECT following FROM post_follows WHERE post_id = ${posts.id} AND user_id = ${followerId}),
        CASE WHEN ${posts.authorId} = ${followerId}
          OR EXISTS (SELECT 1 FROM votes WHERE post_id = ${posts.id} AND user_id = ${followerId})
          OR EXISTS (SELECT 1 FROM comments WHERE post_id = ${posts.id} AND author_id = ${followerId} AND hidden_at IS NULL)
        THEN 1 ELSE 0 END
      )`.mapWith(Boolean)
    : sql<number>`0`.mapWith(Boolean);
  const [rows, attached] = await db.batch([
    db
      .select({
        post: posts,
        author: authorFields,
        shipped: shippedInField.as("shipped_in"),
        viewerIsFollowing: viewerIsFollowing.as("viewer_is_following"),
        ...counts(viewer),
      })
      .from(posts)
      .innerJoin(user, eq(posts.authorId, user.id))
      .where(eq(posts.id, id)),
    db.select().from(images).where(eq(images.postId, id)).orderBy(images.position),
  ]);
  const row = rows[0];
  if (!row) throw notFound();
  // A hidden or spam post is visible only to its author and to admins. Direct links give
  // everyone else the same "not found" as a post that never existed.
  const moderated = row.post.hiddenAt !== null || Boolean(row.post.spam);
  if (moderated && viewer?.id !== row.post.authorId && !viewer?.admin) throw notFound();
  const shippedIn = parseShippedIn(row.shipped);
  return {
    ...summary(row),
    viewerIsFollowing: Boolean(row.viewerIsFollowing),
    ...(viewer?.admin && !viewer.banned && viewer.kind !== "anonymous"
      ? { priority: row.post.priority }
      : {}),
    body: row.post.body,
    ...(shippedIn.length ? { shippedIn } : {}),
    githubUrl: row.post.githubUrl,
    ...(row.post.mergedInto ? { mergedInto: await mergeTarget(row.post.mergedInto) } : {}),
    images: attached.map((image) => ({
      id: image.id,
      url: `/api/media/${image.id}`,
      width: image.width,
      height: image.height,
    })),
  };
}
