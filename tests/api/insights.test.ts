import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import type { Category, Status, ViewerUser } from "../../src/contracts/domain.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { getInsights } from "../../src/server/insights.ts";
import { clearInsightsCache, INSIGHTS_TTL_MS } from "../../src/server/insights-cache.ts";
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
  statusChangedAt?: number | null;
  doneAt?: number | null;
  githubClosedAt?: number | null;
  hiddenAt?: number | null;
  spam?: number;
  mergedInto?: string | null;
  priority?: number | null;
}) {
  const id = opts.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO posts (id, author_id, title, body, category, status, created_at, updated_at, status_changed_at, done_at, github_closed_at, hidden_at, spam, merged_into, priority)
     VALUES (?, ?, ?, 'Post body', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      opts.authorId,
      opts.title ?? `Post ${id.slice(0, 6)}`,
      opts.category ?? "feature",
      opts.status ?? "open",
      opts.createdAt,
      opts.updatedAt ?? opts.createdAt,
      opts.statusChangedAt ?? null,
      opts.doneAt ?? null,
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

  it("loads the entire dashboard in one D1 batch and caches it per range for 5 minutes", async () => {
    const batch = vi.fn((statements: D1PreparedStatement[]) => env.DB.batch(statements));
    const spyDb = {
      prepare: (query: string) => env.DB.prepare(query),
      batch,
    } as unknown as D1Database;
    const first = await getInsights({ range: "30d" }, NOW, spyDb);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(5);
    expect(first.generatedAt).toBe(new Date(NOW).toISOString());

    // Within the TTL: same result, no D1 read. Another range is its own entry.
    expect(await getInsights({ range: "30d" }, NOW + INSIGHTS_TTL_MS - 1, spyDb)).toBe(first);
    expect(batch).toHaveBeenCalledTimes(1);
    await getInsights({ range: "7d" }, NOW, spyDb);
    expect(batch).toHaveBeenCalledTimes(2);

    const later = await getInsights({ range: "30d" }, NOW + INSIGHTS_TTL_MS, spyDb);
    expect(batch).toHaveBeenCalledTimes(3);
    expect(later.generatedAt).toBe(new Date(NOW + INSIGHTS_TTL_MS).toISOString());

    // A failed load is not kept.
    clearInsightsCache();
    batch.mockRejectedValueOnce(new Error("d1 down"));
    await expect(getInsights({ range: "90d" }, NOW, spyDb)).rejects.toThrow("d1 down");
    await expect(getInsights({ range: "90d" }, NOW, spyDb)).resolves.toMatchObject({
      range: "90d",
    });
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
      doneAt: NOW - 1 * DAY_MS,
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
    // Whole UTC days, today included: 7d draws 7 bars from the same day the totals start on.
    expect(sevenDay.volumeSeries.map((b) => b.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(sevenDay.volumeSeries.reduce((s, b) => s + b.posts, 0)).toBe(1);
    expect(sevenDay.volumeSeries.reduce((s, b) => s + b.votes, 0)).toBe(2);
    expect(sevenDay.volumeSeries.reduce((s, b) => s + b.comments, 0)).toBe(1);

    const thirtyDay = await getInsights({ range: "30d" }, NOW);
    expect(thirtyDay.totals).toEqual({ posts: 2, votes: 2, comments: 1, shipped: 1 });
    expect(thirtyDay.volumeSeries).toHaveLength(30);

    const ninetyDay = await getInsights({ range: "90d" }, NOW);
    expect(ninetyDay.totals).toEqual({ posts: 3, votes: 3, comments: 1, shipped: 1 });
    expect(ninetyDay.volumeSeries.reduce((s, b) => s + b.posts, 0)).toBe(3);
    // Weekly bars count from the first day of the window, so none starts before it.
    expect(ninetyDay.volumeSeries).toHaveLength(13);
    expect(ninetyDay.volumeSeries[0]?.date).toBe("2026-08-18");
    expect(ninetyDay.volumeSeries.at(-1)?.date).toBe("2026-11-10");

    const allTime = await getInsights({ range: "all" }, NOW);
    expect(allTime.totals).toEqual({ posts: 3, votes: 3, comments: 1, shipped: 1 });
    expect(allTime.volumeSeries.reduce((s, b) => s + b.posts, 0)).toBe(3);
  });

  it("computes median first response and delivery from stamps, never updated_at", async () => {
    const adminId = await makeUser({ name: "Maintainer", role: "admin" });
    const userId = await makeUser({ name: "Reporter", role: "user" });
    const bump = (createdAt: number) => ({ updatedAt: createdAt + 20 * DAY_MS });

    // A: a reporter comment at +1h is ignored; the admin comment at +4h -> 4h.
    const postA = await makePost({
      authorId: userId,
      createdAt: NOW - 10 * DAY_MS,
      ...bump(NOW - 10 * DAY_MS),
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
    // B: moved to planned at +10h -> 10h.
    await makePost({
      authorId: userId,
      status: "planned",
      createdAt: NOW - 8 * DAY_MS,
      statusChangedAt: NOW - 8 * DAY_MS + 10 * HOUR_MS,
    });
    // C: linked to a published release at +2h -> 2h. A draft entry never counts.
    const postC = await makePost({ authorId: userId, createdAt: NOW - 6 * DAY_MS });
    await makeChangelogEntry({
      status: "published",
      createdAt: NOW - 6 * DAY_MS + 2 * HOUR_MS,
      publishedAt: NOW - 6 * DAY_MS + 2 * HOUR_MS,
      postIds: [postC],
    });
    await makeChangelogEntry({
      status: "draft",
      createdAt: NOW - 6 * DAY_MS + 1 * HOUR_MS,
      postIds: [postC],
    });
    // D: no admin activity, only a bumped updated_at -> left out of the median.
    await makePost({ authorId: userId, createdAt: NOW - 5 * DAY_MS, ...bump(NOW - 5 * DAY_MS) });

    // Delivery: done_at (3 days), github_closed_at (2 days), a release (6 days).
    await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 6 * DAY_MS,
      doneAt: NOW - 3 * DAY_MS,
      githubClosedAt: NOW - 1 * DAY_MS,
    });
    await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 5 * DAY_MS,
      githubClosedAt: NOW - 3 * DAY_MS,
    });
    const released = await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 8 * DAY_MS,
    });
    await makeChangelogEntry({
      status: "published",
      createdAt: NOW - 2 * DAY_MS,
      publishedAt: NOW - 2 * DAY_MS,
      postIds: [released],
    });
    // Done with no stamp at all (a 0.3.1 row): not shipped, not in the median.
    await makePost({
      authorId: userId,
      status: "done",
      createdAt: NOW - 4 * DAY_MS,
      updatedAt: NOW - 1 * DAY_MS,
    });

    const insights = await getInsights({ range: "30d" }, NOW);
    // [2h, 4h, 10h, 144h (the released done post)]: an even set averages the middle two.
    expect(insights.timing.medianFirstResponseHours).toBe(7);
    // [2d, 3d, 6d] -> 3d.
    expect(insights.timing.medianTimeToDeliveryDays).toBe(3);
    expect(insights.totals.shipped).toBe(3);

    // The earliest signal wins: E moved at +6h but an admin replied at +3h, so [2, 3, 4, 10, 144].
    const postE = await makePost({
      authorId: userId,
      createdAt: NOW - 4 * DAY_MS,
      statusChangedAt: NOW - 4 * DAY_MS + 6 * HOUR_MS,
    });
    await makeComment({
      postId: postE,
      authorId: adminId,
      createdAt: NOW - 4 * DAY_MS + 3 * HOUR_MS,
    });
    clearInsightsCache();
    expect((await getInsights({ range: "30d" }, NOW)).timing.medianFirstResponseHours).toBe(4);
  });

  it("stamps status_changed_at and done_at by trigger, and only on status moves", async () => {
    const author = await makeUser();
    const voter = await makeUser();
    const now = Date.now();
    const id = await makePost({
      authorId: author,
      createdAt: now - 2 * HOUR_MS,
      updatedAt: now - 2 * HOUR_MS,
    });
    const stamps = async () =>
      (await env.DB.prepare(
        "SELECT status_changed_at AS moved, done_at AS done FROM posts WHERE id = ?",
      )
        .bind(id)
        .first<{ moved: number | null; done: number | null }>())!;
    const set = (statement: string, ...values: unknown[]) =>
      env.DB.prepare(statement)
        .bind(...values)
        .run();

    expect(await stamps()).toEqual({ moved: null, done: null });
    await set("UPDATE posts SET status = 'planned', updated_at = ? WHERE id = ?", now, id);
    const planned = await stamps();
    expect(planned.moved).toBeGreaterThanOrEqual(now);
    expect(planned.done).toBeNull();

    // A vote, a comment-style updated_at bump, an edit and a no-op status write do not stamp.
    await makeVote(id, voter, now + 1_000);
    await set("UPDATE posts SET updated_at = ?, title = 'Edited' WHERE id = ?", now + 1_000, id);
    await set("UPDATE posts SET status = 'planned' WHERE id = ?", id);
    expect(await stamps()).toEqual(planned);

    // The response time is the time to planned, not the later activity.
    const insights = await getInsights({ range: "7d" }, now);
    expect(insights.timing.medianFirstResponseHours).toBe(2);

    // Only the first move off 'open' counts; every move to 'done' restamps done_at.
    await set("UPDATE posts SET status = 'done', done_at = 1 WHERE id = ?", id);
    await set("UPDATE posts SET done_at = 1 WHERE id = ?", id);
    await set("UPDATE posts SET status = 'open' WHERE id = ?", id);
    await set("UPDATE posts SET status = 'done' WHERE id = ?", id);
    const done = await stamps();
    expect(done.moved).toBe(planned.moved);
    expect(done.done).toBeGreaterThanOrEqual(now);
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
