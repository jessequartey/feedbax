import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import type { Category, Status, ViewerUser } from "../../src/contracts/domain.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { getInsights } from "../../src/server/insights.ts";
import { writer } from "./helpers.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-15T12:00:00.000Z");

beforeEach(async () => {
  await resetEnv();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function makeUser(
  opts: {
    name?: string;
    role?: "user" | "admin";
    anonymous?: boolean;
    bannedAt?: number | null;
  } = {},
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, email_verified, is_anonymous, role, banned_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
  )
    .bind(
      id,
      opts.name ?? "User",
      `${id}@example.com`,
      opts.anonymous ? 1 : 0,
      opts.role ?? "user",
      opts.bannedAt ?? null,
    )
    .run();
  return id;
}

async function makePost(opts: {
  id?: string;
  authorId: string;
  title?: string;
  category?: Category;
  status?: Status;
  createdAt: number;
  updatedAt?: number;
  githubClosedAt?: number | null;
  hiddenAt?: number | null;
  spam?: number;
  mergedInto?: string | null;
  priority?: number | null;
}) {
  const id = opts.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO posts (id, author_id, title, body, category, status, created_at, updated_at, github_closed_at, hidden_at, spam, merged_into, priority)
     VALUES (?, ?, ?, 'Post body', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      opts.authorId,
      opts.title ?? `Post ${id.slice(0, 6)}`,
      opts.category ?? "feature",
      opts.status ?? "open",
      opts.createdAt,
      opts.updatedAt ?? opts.createdAt,
      opts.githubClosedAt ?? null,
      opts.hiddenAt ?? null,
      opts.spam ?? 0,
      opts.mergedInto ?? null,
      opts.priority ?? null,
    )
    .run();
  return id;
}

async function makeVote(postId: string, userId: string, createdAt: number) {
  await env.DB.prepare("INSERT INTO votes (post_id, user_id, created_at) VALUES (?, ?, ?)")
    .bind(postId, userId, createdAt)
    .run();
}

async function makeComment(opts: {
  postId: string;
  authorId: string;
  createdAt: number;
  hiddenAt?: number | null;
}) {
  await env.DB.prepare(
    "INSERT INTO comments (id, post_id, author_id, body, hidden_at, created_at) VALUES (?, ?, ?, 'Comment body', ?, ?)",
  )
    .bind(crypto.randomUUID(), opts.postId, opts.authorId, opts.hiddenAt ?? null, opts.createdAt)
    .run();
}

async function makeChangelogEntry(opts: {
  status: "draft" | "published";
  createdAt: number;
  publishedAt?: number | null;
  postIds?: string[];
}) {
  const entryId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO changelog_entries (id, title, body, status, published_at, created_at, updated_at) VALUES (?, 'Release', 'Notes', ?, ?, ?, ?)",
  )
    .bind(entryId, opts.status, opts.publishedAt ?? null, opts.createdAt, opts.createdAt)
    .run();
  for (const postId of opts.postIds ?? []) {
    await env.DB.prepare("INSERT INTO changelog_posts (entry_id, post_id) VALUES (?, ?)")
      .bind(entryId, postId)
      .run();
  }
  return entryId;
}

describe("admin insights", () => {
  it("enforces server-side admin auth and rejects invalid ranges", async () => {
    const regular = await writer();
    const bannedAdmin: ViewerUser = { ...regular, admin: true, banned: true };
    const anonAdmin: ViewerUser = { ...regular, admin: true, kind: "anonymous" };
    for (const viewer of [null, regular, bannedAdmin, anonAdmin]) {
      await expect(adminApi.insights(viewer, { range: "30d" })).rejects.toMatchObject({
        code: expect.stringMatching(/^(unauthenticated|forbidden)$/),
      });
    }

    const adminUser: ViewerUser = { ...regular, admin: true };
    const result = await adminApi.insights(adminUser, undefined);
    expect(result.range).toBe("30d");
    expect(result.totals).toEqual({ posts: 0, votes: 0, comments: 0, shipped: 0 });
    expect(result.timing).toEqual({
      medianFirstResponseHours: null,
      medianTimeToDeliveryDays: null,
    });
    expect(result.popularRequests).toEqual([]);
    expect(result.topContributors).toEqual([]);

    await expect(adminApi.insights(adminUser, { range: "1y" })).rejects.toMatchObject({
      code: "invalid_input",
      field: "range",
    });
  });

  it("loads the entire dashboard in a single D1 batch round-trip", async () => {
    const batch = vi.fn((statements: D1PreparedStatement[]) => env.DB.batch(statements));
    const spyDb = {
      prepare: (query: string) => env.DB.prepare(query),
      batch,
    } as unknown as D1Database;
    await getInsights({ range: "30d" }, NOW, spyDb);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(6);
  });

  it("filters totals, volume series, and breakdowns by range while excluding hidden, spam, and merged posts", async () => {
    const alice = await makeUser({ name: "Alice" });
    const bob = await makeUser({ name: "Bob" });

    // Recent visible posts (within 7d)
    const p1 = await makePost({
      authorId: alice,
      category: "feature",
      status: "open",
      createdAt: NOW - 2 * DAY_MS,
    });
    await makePost({
      authorId: bob,
      category: "bug",
      status: "done",
      createdAt: NOW - 10 * DAY_MS,
      updatedAt: NOW - 1 * DAY_MS,
    });
    // Older visible post (45 days ago -> in 90d & all, outside 7d & 30d)
    const p3 = await makePost({
      authorId: alice,
      category: "general",
      status: "planned",
      createdAt: NOW - 45 * DAY_MS,
    });
    // Moderated posts: hidden, spam, merged -> must NOT count anywhere
    const pHidden = await makePost({
      authorId: alice,
      category: "feature",
      status: "open",
      createdAt: NOW - 1 * DAY_MS,
      hiddenAt: NOW - 1 * DAY_MS,
    });
    const pSpam = await makePost({
      authorId: alice,
      category: "bug",
      status: "done",
      createdAt: NOW - 1 * DAY_MS,
      spam: 1,
    });
    await makePost({
      authorId: alice,
      category: "feature",
      status: "closed",
      createdAt: NOW - 1 * DAY_MS,
      mergedInto: p1,
    });

    await makeVote(p1, alice, NOW - 2 * DAY_MS);
    await makeVote(p1, bob, NOW - 1 * DAY_MS);
    await makeVote(p3, alice, NOW - 40 * DAY_MS);
    // Vote on hidden/spam post should not be counted
    await makeVote(pHidden, bob, NOW - 1 * DAY_MS);
    await makeVote(pSpam, bob, NOW - 1 * DAY_MS);

    await makeComment({ postId: p1, authorId: bob, createdAt: NOW - 1 * DAY_MS });
    // Hidden comment should not be counted
    await makeComment({
      postId: p1,
      authorId: alice,
      createdAt: NOW - 1 * DAY_MS,
      hiddenAt: NOW - 1 * DAY_MS,
    });

    const sevenDay = await getInsights({ range: "7d" }, NOW);
    expect(sevenDay.totals).toEqual({ posts: 1, votes: 2, comments: 1, shipped: 1 });
    expect(sevenDay.statusBreakdown).toEqual({
      open: 1,
      planned: 1,
      in_progress: 0,
      done: 1,
      closed: 0,
    });
    expect(sevenDay.categoryBreakdown).toEqual({
      feature: 1,
      bug: 1,
      general: 1,
    });
    expect(sevenDay.volumeSeries.reduce((s, b) => s + b.posts, 0)).toBe(1);
    expect(sevenDay.volumeSeries.reduce((s, b) => s + b.votes, 0)).toBe(2);
    expect(sevenDay.volumeSeries.reduce((s, b) => s + b.comments, 0)).toBe(1);

    const thirtyDay = await getInsights({ range: "30d" }, NOW);
    expect(thirtyDay.totals).toEqual({ posts: 2, votes: 2, comments: 1, shipped: 1 });

    const ninetyDay = await getInsights({ range: "90d" }, NOW);
    expect(ninetyDay.totals).toEqual({ posts: 3, votes: 3, comments: 1, shipped: 1 });
    expect(ninetyDay.volumeSeries.reduce((s, b) => s + b.posts, 0)).toBe(3);

    const allTime = await getInsights({ range: "all" }, NOW);
    expect(allTime.totals).toEqual({ posts: 3, votes: 3, comments: 1, shipped: 1 });
    expect(allTime.volumeSeries.reduce((s, b) => s + b.posts, 0)).toBe(3);
  });

  it("computes median first response hours and median time to delivery days", async () => {
    const adminId = await makeUser({ name: "Maintainer", role: "admin" });
    const userId = await makeUser({ name: "Reporter", role: "user" });

    // Post A: open, non-admin comment at +1h (ignored!), admin comment at +4h -> 4.0h response
    const postA = await makePost({
      authorId: userId,
      status: "open",
      createdAt: NOW - 10 * DAY_MS,
      updatedAt: NOW - 10 * DAY_MS + 1 * HOUR_MS,
    });
    await makeComment({
      postId: postA,
      authorId: userId,
      createdAt: NOW - 10 * DAY_MS + 1 * HOUR_MS,
    });
    await makeComment({
      postId: postA,
      authorId: adminId,
      createdAt: NOW - 10 * DAY_MS + 4 * HOUR_MS,
    });

    // Post B: moved to planned at +10h -> 10.0h response
    await makePost({
      authorId: userId,
      status: "planned",
      createdAt: NOW - 8 * DAY_MS,
      updatedAt: NOW - 8 * DAY_MS + 10 * HOUR_MS,
    });

    // Post C: open, linked to changelog entry at +2h -> 2.0h response
    const postC = await makePost({
      authorId: userId,
      status: "open",
      createdAt: NOW - 6 * DAY_MS,
    });
    await makeChangelogEntry({
      status: "published",
      createdAt: NOW - 6 * DAY_MS + 2 * HOUR_MS,
      publishedAt: NOW - 6 * DAY_MS + 2 * HOUR_MS,
      postIds: [postC],
    });

    // Post D: still open with zero admin activity -> excluded from response median
    await makePost({
      authorId: userId,
      status: "open",
      createdAt: NOW - 5 * DAY_MS,
    });

    // Shipped post 1: delivered via github_closed_at after 2.0 days
    await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 5 * DAY_MS,
      updatedAt: NOW - 1 * DAY_MS,
      githubClosedAt: NOW - 3 * DAY_MS,
    });

    // Shipped post 2: delivered via changelog published_at after 6.0 days
    const shipped2 = await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 8 * DAY_MS,
      updatedAt: NOW - 1 * DAY_MS,
    });
    await makeChangelogEntry({
      status: "published",
      createdAt: NOW - 2 * DAY_MS,
      publishedAt: NOW - 2 * DAY_MS,
      postIds: [shipped2],
    });

    // Shipped post 3: delivered via updated_at after 4.0 days
    await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 6 * DAY_MS,
      updatedAt: NOW - 2 * DAY_MS,
    });

    const insights = await getInsights({ range: "30d" }, NOW);
    // Response times: Post C (2h), Post A (4h), Post B (10h), Shipped 1 (48h), Shipped 3 (96h), Shipped 2 (144h) -> median (10+48)/2 = 29h
    expect(insights.timing.medianFirstResponseHours).toBe(29);
    // Delivery times: [2d, 4d, 6d] -> median 4.0d
    expect(insights.timing.medianTimeToDeliveryDays).toBe(4);
  });

  it("ranks top 5 open/planned/in_progress public requests and protects anonymous contributor privacy", async () => {
    const anon1 = await makeUser({ name: "Guest-123", anonymous: true });
    const anon2 = await makeUser({ name: "Guest-456", anonymous: true });
    const bannedUser = await makeUser({ name: "Banned", bannedAt: NOW - DAY_MS });
    const alice = await makeUser({ name: "Alice" });
    const bob = await makeUser({ name: "Bob" });

    // Create 6 open/planned/in_progress visible posts + 1 done + 1 hidden + 1 spam + 1 merged
    const openIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = await makePost({
        authorId: i % 2 === 0 ? anon1 : alice,
        title: `Request ${i + 1}`,
        status: i === 0 ? "planned" : i === 1 ? "in_progress" : "open",
        priority: i === 0 ? 90 : null,
        createdAt: NOW - (i + 1) * DAY_MS,
      });
      openIds.push(id);
      // Give Request 1..6 votes: 1->6, 2->5, ..., 6->1 (using voters)
      const voters = [anon1, anon2, alice, bob, bannedUser];
      for (let v = 0; v < Math.min(6 - i, voters.length); v++) {
        await makeVote(id, voters[v]!, NOW - DAY_MS);
      }
    }

    // Done post with 100% of voters -> must NOT appear in popularRequests
    const donePost = await makePost({
      authorId: bob,
      title: "Already shipped",
      status: "done",
      createdAt: NOW - DAY_MS,
    });
    for (const u of [anon1, anon2, alice, bob]) await makeVote(donePost, u, NOW - DAY_MS);

    // Hidden / spam / merged posts with lots of votes -> must NOT appear in popularRequests
    const hiddenPost = await makePost({
      authorId: bob,
      title: "Secret hidden",
      status: "open",
      createdAt: NOW - DAY_MS,
      hiddenAt: NOW - DAY_MS,
    });
    for (const u of [anon1, anon2, alice, bob]) await makeVote(hiddenPost, u, NOW - DAY_MS);

    const spamPost = await makePost({
      authorId: bob,
      title: "Buy spam",
      status: "open",
      createdAt: NOW - DAY_MS,
      spam: 1,
    });
    for (const u of [anon1, anon2, alice, bob]) await makeVote(spamPost, u, NOW - DAY_MS);

    const mergedPost = await makePost({
      authorId: bob,
      title: "Merged dup",
      status: "open",
      createdAt: NOW - DAY_MS,
      mergedInto: openIds[0],
    });
    for (const u of [anon1, anon2, alice, bob]) await makeVote(mergedPost, u, NOW - DAY_MS);

    // Anonymous user posts heavily; must still be excluded from topContributors
    await makeComment({ postId: openIds[0]!, authorId: anon1, createdAt: NOW - DAY_MS });
    await makeComment({ postId: openIds[1]!, authorId: anon1, createdAt: NOW - DAY_MS });
    await makeComment({ postId: openIds[0]!, authorId: alice, createdAt: NOW - DAY_MS });

    const insights = await getInsights({ range: "30d" }, NOW);

    expect(insights.popularRequests).toHaveLength(5);
    expect(insights.popularRequests.map((r) => r.title)).toEqual([
      "Request 1",
      "Request 2",
      "Request 3",
      "Request 4",
      "Request 5",
    ]);
    expect(insights.popularRequests[0]?.priority).toBe(90);
    expect(insights.popularRequests[0]?.comments).toBe(2);

    // Only non-anonymous, non-banned users appear in topContributors
    const contributorIds = insights.topContributors.map((c) => c.id);
    expect(contributorIds).not.toContain(anon1);
    expect(contributorIds).not.toContain(anon2);
    expect(contributorIds).not.toContain(bannedUser);
    expect(insights.topContributors).toEqual([
      { id: alice, name: "Alice", posts: 3, comments: 1, votes: 5 },
      { id: bob, name: "Bob", posts: 1, comments: 0, votes: 4 },
    ]);
  });
});
