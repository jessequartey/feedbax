import { env, waitUntil } from "cloudflare:workers";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "@tanstack/react-router";
import config from "../../feedbax.config.ts";
import { LIMITS } from "../contracts/domain.ts";
import type {
  ListPostsInput,
  Page,
  PostDetail,
  PostSummary,
  ViewerUser,
} from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { images, posts, user } from "../db/schema.ts";
import { DomainError, invalid } from "./errors.ts";
import { category, listInput, text, uuid } from "./validation.ts";
import { requireWriter } from "./auth.ts";
import { storeImage, validateImage } from "./images.ts";

export function enqueuePost(postId: string) {
  waitUntil(env.SYNC_QUEUE.send({ type: "notion.post", postId }).catch(() => undefined));
}
export async function createPostForUser(
  value: unknown,
  viewer: ViewerUser | null,
  settings = config,
) {
  const writer = requireWriter(viewer, settings);
  if (!(value instanceof FormData)) invalid();
  for (const key of ["id", "title", "body", "category"])
    if (value.getAll(key).length !== 1) invalid(key);
  for (const key of value.keys())
    if (!["id", "title", "body", "category", "image"].includes(key)) invalid(key);
  const id = uuid(value.get("id"));
  const title = text(value.get("title"), LIMITS.title, "title");
  const body = text(value.get("body"), LIMITS.body, "body");
  const kind = category(value.get("category"));
  const files = value.getAll("image");
  if (files.length > LIMITS.images)
    throw new DomainError("too_large", "Attach at most 3 images.", "image");
  if (files.some((file) => !(file instanceof File))) invalid("image");
  const validated = await Promise.all((files as File[]).map(validateImage));
  const db = createDb(env.DB);
  const response = (status: number) => ({
    status,
    data: { postId: id, postUrl: `${env.PORTAL_URL.replace(/\/$/, "")}/posts/${id}` },
  });
  const replay = await db.select().from(posts).where(eq(posts.id, id)).get();
  if (replay) {
    if (replay.authorId !== writer.id)
      throw new DomainError("conflict", "This post ID is already in use.");
    return response(200);
  }
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
  const insert = db
    .insert(posts)
    .select(
      sql`SELECT ${id}, ${writer.id}, ${title}, ${body}, ${kind}, 'open', ${now}, ${now}, 1, NULL, 0, 0, NULL, NULL, NULL WHERE (SELECT count(*) FROM posts WHERE author_id = ${writer.id} AND created_at > ${since}) < ${LIMITS.postsPerHour}`,
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
    return response(200);
  }
  enqueuePost(id);
  return response(201);
}
function counts(viewer: ViewerUser | null) {
  return {
    votes: sql<number>`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`.mapWith(Number),
    comments: sql<number>`(SELECT count(*) FROM comments WHERE post_id = ${posts.id})`.mapWith(
      Number,
    ),
    viewerHasVoted:
      sql<number>`EXISTS (SELECT 1 FROM votes WHERE post_id = ${posts.id} AND user_id = ${viewer?.id ?? ""})`.mapWith(
        Boolean,
      ),
  };
}
function summary(row: {
  post: typeof posts.$inferSelect;
  author: { id: string; name: string; isAnonymous: boolean | null };
  votes: number;
  comments: number;
  viewerHasVoted: boolean;
}): PostSummary {
  const body = Array.from(row.post.body.replace(/\s+/gu, " ").trim());
  return {
    id: row.post.id,
    title: row.post.title,
    excerpt: body.slice(0, 180).join("") + (body.length > 180 ? "…" : ""),
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
  };
}
const authorFields = { id: user.id, name: user.name, isAnonymous: user.isAnonymous };
export async function listPostPage(
  input: ListPostsInput,
  viewer: ViewerUser | null,
  mine = false,
): Promise<Page<PostSummary>> {
  const data = listInput(input),
    db = createDb(env.DB);
  if (mine && !viewer)
    return { items: [], page: data.page, limit: data.limit, total: 0, hasMore: false };
  const pattern = `%${(data.q ?? "").replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    data.category ? eq(posts.category, data.category) : undefined,
    data.status ? eq(posts.status, data.status) : undefined,
    mine ? eq(posts.authorId, viewer!.id) : undefined,
    data.q
      ? sql`(${posts.title} LIKE ${pattern} ESCAPE ${"\\"} OR ${posts.body} LIKE ${pattern} ESCAPE ${"\\"})`
      : undefined,
  );
  const voteOrder =
    data.sort === "top"
      ? sql`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`
      : sql`(SELECT count(*) FROM votes WHERE post_id = ${posts.id} AND created_at >= ${Date.now() - 7 * 86400000})`;
  const order = [
    ...(data.sort === "new" ? [] : [desc(voteOrder)]),
    desc(posts.createdAt),
    desc(posts.id),
  ];
  const [rows, total] = await Promise.all([
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
      .where(where)
      .get(),
  ]);
  return {
    items: rows.map(summary),
    page: data.page,
    limit: data.limit,
    total: total!.count,
    hasMore: data.page * data.limit < total!.count,
  };
}
export async function getPostDetail(id: string, viewer: ViewerUser | null): Promise<PostDetail> {
  uuid(id);
  const db = createDb(env.DB);
  const row = await db
    .select({ post: posts, author: authorFields, ...counts(viewer) })
    .from(posts)
    .innerJoin(user, eq(posts.authorId, user.id))
    .where(eq(posts.id, id))
    .get();
  if (!row) throw notFound();
  const attached = await db
    .select()
    .from(images)
    .where(eq(images.postId, id))
    .orderBy(images.position);
  return {
    ...summary(row),
    body: row.post.body,
    githubUrl: row.post.githubUrl,
    images: attached.map((image) => ({
      id: image.id,
      url: `/api/media/${image.id}`,
      width: image.width,
      height: image.height,
    })),
  };
}
