import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { notFound } from "@tanstack/react-router";
import {
  CHANGELOG_LIMITS,
  type AdminChangelogEntry,
  type AdminChangelogPage,
  type ChangelogEntry,
  type ChangelogPage,
  type ChangelogPostCandidate,
  type ChangelogPostLink,
  type ShippedIn,
} from "../contracts/changelog.ts";
import { createDb, type Db } from "../db/client.ts";
import { changelogEntries, changelogPosts, posts } from "../db/schema.ts";
import { emitChangelogPublished } from "./changelog-events.ts";
import { DomainError, invalid } from "./errors.ts";
import { markdownText, pageNumber, record, text, uuid } from "./validation.ts";
import { publiclyVisible } from "./visibility.ts";

// The changelog: public reads (published entries only, linked posts filtered through
// `publiclyVisible`), admin writes (callers must already have passed `requireAdmin`, see
// admin-api.ts), and the auto-draft that sync uses when a post becomes Done.

const iso = (ms: number) => new Date(ms).toISOString();
const portalUrl = () => env.PORTAL_URL.replace(/\/$/, "");
/** Absolute URL of an entry's public page (RSS, events). */
export const entryUrl = (id: string) => `${portalUrl()}/changelog/${id}`;

type LinkRow = ChangelogPostLink & {
  entryId: string;
  hiddenAt: number | null;
  spam: number;
  mergedInto: string | null;
};

/** Linked posts per entry. Public reads pass `publicOnly`: hidden, spam and merged posts drop out. */
async function linkedPosts(db: Db, entryIds: string[], publicOnly: boolean) {
  const byEntry = new Map<string, LinkRow[]>();
  if (!entryIds.length) return byEntry;
  const rows: LinkRow[] = await db
    .select({
      entryId: changelogPosts.entryId,
      id: posts.id,
      title: posts.title,
      status: posts.status,
      hiddenAt: posts.hiddenAt,
      spam: posts.spam,
      mergedInto: posts.mergedInto,
    })
    .from(changelogPosts)
    .innerJoin(posts, eq(posts.id, changelogPosts.postId))
    .where(and(inArray(changelogPosts.entryId, entryIds), publicOnly ? publiclyVisible : undefined))
    .orderBy(posts.title, posts.id);
  for (const row of rows) byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row]);
  return byEntry;
}
const link = ({ id, title, status }: LinkRow): ChangelogPostLink => ({ id, title, status });

type EntryRow = typeof changelogEntries.$inferSelect;
function publicEntry(row: EntryRow, linked: LinkRow[] = []): ChangelogEntry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: iso(row.publishedAt ?? row.createdAt),
    posts: linked.map(link),
  };
}
const published = eq(changelogEntries.status, "published");
const newestFirst = [desc(changelogEntries.publishedAt), desc(changelogEntries.id)];

// ---- Public reads ----

/** Published entries, newest first. Drafts never appear. */
export async function listPublishedEntries(input: unknown): Promise<ChangelogPage> {
  const data = record(input ?? {}),
    page = pageNumber(data.page),
    limit = CHANGELOG_LIMITS.pageSize,
    db = createDb(env.DB);
  const [rows, totals] = await db.batch([
    db
      .select()
      .from(changelogEntries)
      .where(published)
      .orderBy(...newestFirst)
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(changelogEntries)
      .where(published),
  ]);
  const total = totals[0]!.count;
  const linked = await linkedPosts(
    db,
    rows.map((row) => row.id),
    true,
  );
  return {
    items: rows.map((row) => publicEntry(row, linked.get(row.id))),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

/** One published entry. A draft, a missing entry and a malformed id are all "not found". */
export async function getPublishedEntry(id: unknown): Promise<ChangelogEntry> {
  try {
    uuid(id);
  } catch {
    throw notFound();
  }
  const db = createDb(env.DB);
  const row = await db
    .select()
    .from(changelogEntries)
    .where(and(eq(changelogEntries.id, id as string), published))
    .get();
  if (!row) throw notFound();
  return publicEntry(row, (await linkedPosts(db, [row.id], true)).get(row.id));
}

/** The newest published entries, for the RSS feed. */
export async function listFeedEntries(limit = 50): Promise<ChangelogEntry[]> {
  const db = createDb(env.DB);
  const rows = await db
    .select()
    .from(changelogEntries)
    .where(published)
    .orderBy(...newestFirst)
    .limit(limit);
  const linked = await linkedPosts(
    db,
    rows.map((row) => row.id),
    true,
  );
  return rows.map((row) => publicEntry(row, linked.get(row.id)));
}

/**
 * "Shipped in …" for a post page: its published entries, newest first, at most three. A scalar
 * subquery (JSON text) so the post page reads it with the post itself, in the same D1 query.
 * Use it as a select field next to `posts` and decode with `parseShippedIn`.
 */
export const shippedInField = sql<string>`(SELECT json_group_array(json_object('id', s.id, 'title', s.title)) FROM (SELECT e.id, e.title FROM changelog_posts cp JOIN changelog_entries e ON e.id = cp.entry_id WHERE cp.post_id = ${posts.id} AND e.status = 'published' ORDER BY e.published_at DESC, e.id DESC LIMIT 3) s)`;
export function parseShippedIn(json: string | null): ShippedIn[] {
  try {
    const parsed: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(parsed) ? (parsed as ShippedIn[]) : [];
  } catch {
    return [];
  }
}

// ---- Admin ----

const PAGE_SIZE = 20;

async function adminEntries(db: Db, rows: EntryRow[]): Promise<AdminChangelogEntry[]> {
  const linked = await linkedPosts(
    db,
    rows.map((row) => row.id),
    false,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    githubUrl: row.githubUrl,
    publishedAt: row.publishedAt === null ? null : iso(row.publishedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    posts: (linked.get(row.id) ?? []).map((item) => ({
      ...link(item),
      visible: item.hiddenAt === null && !item.spam && item.mergedInto === null,
    })),
  }));
}

/** Every entry, drafts and published, most recently changed first. */
export async function listAdminEntries(input: unknown): Promise<AdminChangelogPage> {
  const data = record(input ?? {}),
    page = pageNumber(data.page),
    db = createDb(env.DB);
  const [rows, totals] = await db.batch([
    db
      .select()
      .from(changelogEntries)
      .orderBy(desc(changelogEntries.updatedAt), desc(changelogEntries.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)` }).from(changelogEntries),
  ]);
  const total = totals[0]!.count;
  return {
    items: await adminEntries(db, rows),
    page,
    limit: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total,
  };
}

function postIdList(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CHANGELOG_LIMITS.linkedPosts) invalid("postIds");
  return [...new Set(value.map((item) => uuid(item, "postIds")))];
}

/** Newly linked posts must be publicly visible; links that already exist are kept as they are. */
async function checkLinkable(db: Db, ids: string[], entryId?: string) {
  if (!ids.length) return;
  const already = entryId
    ? await db
        .select({ postId: changelogPosts.postId })
        .from(changelogPosts)
        .where(and(eq(changelogPosts.entryId, entryId), inArray(changelogPosts.postId, ids)))
    : [];
  const fresh = ids.filter((id) => !already.some((row) => row.postId === id));
  if (!fresh.length) return;
  const found = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(inArray(posts.id, fresh), publiclyVisible));
  if (found.length !== fresh.length) invalid("postIds");
}

function entryInput(data: Record<string, unknown>) {
  return {
    title: text(data.title, CHANGELOG_LIMITS.title, "title"),
    body: markdownText(data.body ?? "", CHANGELOG_LIMITS.body, "body", 0),
    postIds: postIdList(data.postIds),
  };
}
const linkRows = (entryId: string, ids: string[]) => ids.map((postId) => ({ entryId, postId }));

async function readAdminEntry(db: Db, id: string): Promise<AdminChangelogEntry> {
  const row = await db.select().from(changelogEntries).where(eq(changelogEntries.id, id)).get();
  if (!row) throw new DomainError("not_found", "That entry doesn't exist.");
  return (await adminEntries(db, [row]))[0]!;
}

/** A new draft. `postIds` are linked in the same batch. */
export async function createEntry(input: unknown, authorId: string): Promise<AdminChangelogEntry> {
  const data = record(input),
    { title, body, postIds } = entryInput(data),
    db = createDb(env.DB),
    id = crypto.randomUUID(),
    now = Date.now();
  await checkLinkable(db, postIds);
  const statements: BatchItem<"sqlite">[] = [
    db
      .insert(changelogEntries)
      .values({ id, title, body, status: "draft", authorId, createdAt: now, updatedAt: now }),
    ...(postIds.length ? [db.insert(changelogPosts).values(linkRows(id, postIds))] : []),
  ];
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return readAdminEntry(db, id);
}

async function requireEditable(db: Db, id: string) {
  const row = await db.select().from(changelogEntries).where(eq(changelogEntries.id, id)).get();
  if (!row) throw new DomainError("not_found", "That entry doesn't exist.");
  if (row.githubReleaseId !== null)
    throw new DomainError("forbidden", "Edit this release on GitHub.");
}

/** Edit title, body and the linked posts of any entry. The linked set is replaced. */
export async function updateEntry(input: unknown): Promise<AdminChangelogEntry> {
  const data = record(input),
    id = uuid(data.id),
    { title, body, postIds } = entryInput(data),
    db = createDb(env.DB);
  await requireEditable(db, id);
  await checkLinkable(db, postIds, id);
  const statements: BatchItem<"sqlite">[] = [
    db
      .update(changelogEntries)
      .set({ title, body, updatedAt: Date.now() })
      .where(eq(changelogEntries.id, id)),
    postIds.length
      ? db
          .delete(changelogPosts)
          .where(and(eq(changelogPosts.entryId, id), notInArray(changelogPosts.postId, postIds)))
      : db.delete(changelogPosts).where(eq(changelogPosts.entryId, id)),
    ...(postIds.length
      ? [db.insert(changelogPosts).values(linkRows(id, postIds)).onConflictDoNothing()]
      : []),
  ];
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return readAdminEntry(db, id);
}

export async function deleteEntry(input: unknown): Promise<{ id: string }> {
  const id = uuid(record(input).id),
    db = createDb(env.DB);
  await requireEditable(db, id);
  const gone = await db
    .delete(changelogEntries)
    .where(eq(changelogEntries.id, id))
    .returning({ id: changelogEntries.id });
  if (!gone.length) throw new DomainError("not_found", "That entry doesn't exist.");
  return { id }; // changelog_posts rows go with it (ON DELETE CASCADE).
}

/**
 * Publish a draft (stamps `publishedAt` now) or move a published entry back to draft. Doing
 * either twice changes nothing. Each real draft → published transition emits
 * "changelog.published" (changelog-events.ts).
 */
export async function setChangelogStatus(input: unknown): Promise<AdminChangelogEntry> {
  const data = record(input),
    id = uuid(data.id);
  if (typeof data.published !== "boolean") invalid("published");
  const db = createDb(env.DB);
  await requireEditable(db, id);
  const now = Date.now();
  const changed = data.published
    ? await db
        .update(changelogEntries)
        .set({ status: "published", publishedAt: now, updatedAt: now })
        .where(and(eq(changelogEntries.id, id), eq(changelogEntries.status, "draft")))
        .returning({ id: changelogEntries.id })
    : await db
        .update(changelogEntries)
        .set({ status: "draft", publishedAt: null, updatedAt: now })
        .where(and(eq(changelogEntries.id, id), published))
        .returning({ id: changelogEntries.id });
  const entry = await readAdminEntry(db, id);
  if (data.published && changed.length)
    emitChangelogPublished({
      entry: {
        id,
        title: entry.title,
        body: entry.body,
        publishedAt: entry.publishedAt!,
        postIds: entry.posts.filter((post) => post.visible).map((post) => post.id),
      },
      url: entryUrl(id),
    });
  return entry;
}

/** The post picker: publicly visible posts, newest first, optionally filtered by title. */
export async function searchLinkablePosts(input: unknown): Promise<ChangelogPostCandidate[]> {
  const data = record(input ?? {}),
    q = data.q === undefined ? "" : text(data.q, 100, "q", 0).trim(),
    db = createDb(env.DB),
    pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      createdAt: posts.createdAt,
      votes: sql<number>`(SELECT count(*) FROM votes WHERE post_id = ${posts.id})`.mapWith(Number),
    })
    .from(posts)
    .where(and(publiclyVisible, q ? sql`${posts.title} LIKE ${pattern} ESCAPE ${"\\"}` : undefined))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(20);
  return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) }));
}
