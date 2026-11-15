import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type {
  AdminInsights,
  AdminInsightsContributor,
  AdminInsightsPopularRequest,
  AdminInsightsVolumePoint,
  InsightsRange,
} from "../contracts/admin.ts";
import type { Category, Status } from "../contracts/domain.ts";
import { posts } from "../db/schema.ts";
import { choice, record } from "./validation.ts";
import { publiclyVisible } from "./visibility.ts";

// Insights aggregate publicly visible posts (`publiclyVisible`: not hidden, not spam, not
// merged) and visible comments (`comments.hidden_at IS NULL`). Hidden, spam and merged
// posts are excluded so moderation noise and duplicate merges do not skew counts, timings,
// public request rankings, or contributor rankings. Anonymous users' activity counts in
// totals and volume series, while their identities are excluded from `topContributors`.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<Exclude<InsightsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthLabelFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dialect = new SQLiteSyncDialect();
function prepare(d1: D1Database, statement: ReturnType<typeof sql>) {
  const query = dialect.sqlToQuery(statement);
  return d1.prepare(query.sql).bind(...query.params);
}

const utcDayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcDayMs = (dayKey: string) => Date.parse(`${dayKey}T00:00:00.000Z`);
const utcWeekStartMs = (dayKey: string) => {
  const ms = utcDayMs(dayKey);
  const dow = new Date(ms).getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = (dow + 6) % 7;
  return ms - offsetToMonday * DAY_MS;
};
const formatDayLabel = (dayKey: string) => dayLabelFormat.format(new Date(utcDayMs(dayKey)));
const formatMonthLabel = (monthKey: string) =>
  monthLabelFormat.format(new Date(Date.parse(`${monthKey}-01T00:00:00.000Z`)));

function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function median(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 1) return sortedAsc[mid]!;
  return (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

type SummaryRow = {
  posts_in_range: number;
  shipped_in_range: number;
  status_open: number;
  status_planned: number;
  status_in_progress: number;
  status_done: number;
  status_closed: number;
  cat_feature: number;
  cat_bug: number;
  cat_general: number;
};

type VolumeRow = {
  kind: "post" | "vote" | "comment";
  bucket: string;
  cnt: number;
};

type DurationRow = { duration_ms: number };

type PopularRow = {
  id: string;
  title: string;
  category: Category;
  status: Status;
  priority: number | null;
  created_at: number;
  votes: number;
  comments: number;
};

type ContributorRow = {
  id: string;
  name: string;
  posts: number;
  comments: number;
  votes: number;
};

function buildVolumeSeries(
  rows: VolumeRow[],
  range: InsightsRange,
  since: number | null,
  now: number,
): { series: AdminInsightsVolumePoint[]; votes: number; comments: number } {
  let votes = 0;
  let comments = 0;
  for (const row of rows) {
    const cnt = Number(row.cnt);
    if (row.kind === "vote") votes += cnt;
    else if (row.kind === "comment") comments += cnt;
  }

  if (range === "all" && rows.length === 0) {
    return { series: [], votes, comments };
  }

  let mode: "day" | "week" | "month";
  let startKey: string;
  let endKey = utcDayKey(now);

  if (range === "7d" || range === "30d") {
    mode = "day";
    startKey = utcDayKey(since!);
  } else if (range === "90d") {
    mode = "week";
    startKey = utcDayKey(since!);
  } else {
    let minDay = rows[0]!.bucket;
    let maxDay = endKey;
    for (const row of rows) {
      if (row.bucket < minDay) minDay = row.bucket;
      if (row.bucket > maxDay) maxDay = row.bucket;
    }
    startKey = minDay;
    endKey = maxDay;
    const spanDays = Math.round((utcDayMs(endKey) - utcDayMs(startKey)) / DAY_MS) + 1;
    mode = spanDays <= 35 ? "day" : spanDays <= 180 ? "week" : "month";
  }

  const counts = new Map<string, { posts: number; votes: number; comments: number }>();
  const bucketKeyForDay = (dayKey: string) =>
    mode === "day"
      ? dayKey
      : mode === "week"
        ? utcDayKey(utcWeekStartMs(dayKey))
        : dayKey.slice(0, 7);

  for (const row of rows) {
    const key = bucketKeyForDay(row.bucket);
    const entry = counts.get(key) ?? { posts: 0, votes: 0, comments: 0 };
    const cnt = Number(row.cnt);
    if (row.kind === "post") entry.posts += cnt;
    else if (row.kind === "vote") entry.votes += cnt;
    else if (row.kind === "comment") entry.comments += cnt;
    counts.set(key, entry);
  }

  const series: AdminInsightsVolumePoint[] = [];
  if (mode === "day") {
    const endMs = utcDayMs(endKey);
    for (let ms = utcDayMs(startKey); ms <= endMs; ms += DAY_MS) {
      const date = utcDayKey(ms);
      const entry = counts.get(date);
      series.push({
        label: formatDayLabel(date),
        date,
        posts: entry?.posts ?? 0,
        votes: entry?.votes ?? 0,
        comments: entry?.comments ?? 0,
      });
    }
  } else if (mode === "week") {
    const endMs = utcWeekStartMs(endKey);
    for (let ms = utcWeekStartMs(startKey); ms <= endMs; ms += 7 * DAY_MS) {
      const date = utcDayKey(ms);
      const entry = counts.get(date);
      series.push({
        label: formatDayLabel(date),
        date,
        posts: entry?.posts ?? 0,
        votes: entry?.votes ?? 0,
        comments: entry?.comments ?? 0,
      });
    }
  } else {
    const endMonth = endKey.slice(0, 7);
    for (let month = startKey.slice(0, 7); month <= endMonth; month = nextMonthKey(month)) {
      const entry = counts.get(month);
      series.push({
        label: formatMonthLabel(month),
        date: month,
        posts: entry?.posts ?? 0,
        votes: entry?.votes ?? 0,
        comments: entry?.comments ?? 0,
      });
    }
  }

  return { series, votes, comments };
}

/**
 * Compute all admin insights in a single `env.DB.batch(...)` call (1 D1 round-trip,
 * 6 SQL statements, zero N+1s, zero idle cron cost).
 */
export async function getInsights(
  input: unknown = {},
  now = Date.now(),
  d1: D1Database = env.DB,
): Promise<AdminInsights> {
  const data = input === undefined ? {} : record(input);
  const range: InsightsRange =
    data.range === undefined ? "30d" : choice(data.range, ["7d", "30d", "90d", "all"], "range");
  const since = range === "all" ? null : now - RANGE_DAYS[range] * DAY_MS;

  const publishedAtExpr = sql`(
    SELECT MIN(ce.published_at)
    FROM changelog_posts cp
    JOIN changelog_entries ce ON ce.id = cp.entry_id
    WHERE cp.post_id = ${posts.id}
      AND ce.status = 'published'
      AND ce.published_at IS NOT NULL
  )`;
  const shippedAtExpr = sql`COALESCE(${posts.githubClosedAt}, ${publishedAtExpr}, ${posts.updatedAt})`;

  const statements = [
    // 1. Totals in range (posts, shipped) + all-time status & category breakdowns.
    sql`SELECT
      count(CASE WHEN ${since} IS NULL OR ${posts.createdAt} >= ${since} THEN 1 END) AS posts_in_range,
      count(CASE WHEN ${posts.status} = 'done' AND (${since} IS NULL OR ${shippedAtExpr} >= ${since}) THEN 1 END) AS shipped_in_range,
      count(CASE WHEN ${posts.status} = 'open' THEN 1 END) AS status_open,
      count(CASE WHEN ${posts.status} = 'planned' THEN 1 END) AS status_planned,
      count(CASE WHEN ${posts.status} = 'in_progress' THEN 1 END) AS status_in_progress,
      count(CASE WHEN ${posts.status} = 'done' THEN 1 END) AS status_done,
      count(CASE WHEN ${posts.status} = 'closed' THEN 1 END) AS status_closed,
      count(CASE WHEN ${posts.category} = 'feature' THEN 1 END) AS cat_feature,
      count(CASE WHEN ${posts.category} = 'bug' THEN 1 END) AS cat_bug,
      count(CASE WHEN ${posts.category} = 'general' THEN 1 END) AS cat_general
    FROM posts
    WHERE ${publiclyVisible}`,

    // 2. Daily volume buckets for posts, votes, and comments within range.
    sql`SELECT 'post' AS kind, strftime('%Y-%m-%d', ${posts.createdAt} / 1000, 'unixepoch') AS bucket, count(*) AS cnt
    FROM posts
    WHERE ${publiclyVisible} AND (${since} IS NULL OR ${posts.createdAt} >= ${since})
    GROUP BY bucket
    UNION ALL
    SELECT 'vote' AS kind, strftime('%Y-%m-%d', votes.created_at / 1000, 'unixepoch') AS bucket, count(*) AS cnt
    FROM votes
    JOIN posts ON posts.id = votes.post_id
    WHERE ${publiclyVisible} AND (${since} IS NULL OR votes.created_at >= ${since})
    GROUP BY bucket
    UNION ALL
    SELECT 'comment' AS kind, strftime('%Y-%m-%d', comments.created_at / 1000, 'unixepoch') AS bucket, count(*) AS cnt
    FROM comments
    JOIN posts ON posts.id = comments.post_id
    WHERE comments.hidden_at IS NULL
      AND ${publiclyVisible}
      AND (${since} IS NULL OR comments.created_at >= ${since})
    GROUP BY bucket`,

    // 3. Sorted response durations (ms) for posts created in range that have an admin
    //    comment, status move off 'open', or changelog link.
    sql`SELECT duration_ms FROM (
      SELECT
        CASE
          WHEN first_admin_comment_at IS NULL AND status_moved_at IS NULL AND first_changelog_at IS NULL THEN NULL
          ELSE MIN(
            COALESCE(first_admin_comment_at, 9223372036854775807),
            COALESCE(status_moved_at, 9223372036854775807),
            COALESCE(first_changelog_at, 9223372036854775807)
          ) - created_at
        END AS duration_ms
      FROM (
        SELECT
          ${posts.createdAt} AS created_at,
          (SELECT MIN(c.created_at)
           FROM comments c
           JOIN user u ON u.id = c.author_id
           WHERE c.post_id = ${posts.id}
             AND c.hidden_at IS NULL
             AND u.role = 'admin'
             AND c.created_at >= ${posts.createdAt}) AS first_admin_comment_at,
          CASE
            WHEN ${posts.status} != 'open' THEN
              CASE
                WHEN ${posts.githubClosedAt} IS NOT NULL
                 AND ${posts.githubClosedAt} >= ${posts.createdAt}
                 AND ${posts.githubClosedAt} < ${posts.updatedAt}
                THEN ${posts.githubClosedAt}
                WHEN ${posts.updatedAt} >= ${posts.createdAt} THEN ${posts.updatedAt}
                ELSE NULL
              END
            ELSE NULL
          END AS status_moved_at,
          (SELECT MIN(COALESCE(ce.published_at, ce.created_at))
           FROM changelog_posts cp
           JOIN changelog_entries ce ON ce.id = cp.entry_id
           WHERE cp.post_id = ${posts.id}
             AND COALESCE(ce.published_at, ce.created_at) >= ${posts.createdAt}) AS first_changelog_at
        FROM posts
        WHERE ${publiclyVisible}
          AND (${since} IS NULL OR ${posts.createdAt} >= ${since})
      )
    )
    WHERE duration_ms IS NOT NULL
    ORDER BY duration_ms ASC`,

    // 4. Sorted delivery durations (ms) for done posts shipped in range.
    sql`SELECT (delivered_at - created_at) AS duration_ms FROM (
      SELECT
        ${posts.createdAt} AS created_at,
        ${shippedAtExpr} AS delivered_at
      FROM posts
      WHERE ${publiclyVisible}
        AND ${posts.status} = 'done'
    )
    WHERE delivered_at >= created_at
      AND (${since} IS NULL OR delivered_at >= ${since})
    ORDER BY duration_ms ASC`,

    // 5. Top 5 open/planned/in_progress public requests by votes.
    sql`SELECT
      ${posts.id} AS id,
      ${posts.title} AS title,
      ${posts.category} AS category,
      ${posts.status} AS status,
      ${posts.priority} AS priority,
      ${posts.createdAt} AS created_at,
      (SELECT count(*) FROM votes WHERE votes.post_id = ${posts.id}) AS votes,
      (SELECT count(*) FROM comments WHERE comments.post_id = ${posts.id} AND comments.hidden_at IS NULL) AS comments
    FROM posts
    WHERE ${publiclyVisible}
      AND ${posts.status} IN ('open', 'planned', 'in_progress')
    ORDER BY votes DESC, comments DESC, ${posts.createdAt} DESC, ${posts.id} DESC
    LIMIT 5`,

    // 6. Top 5 non-anonymous, non-banned contributors in range.
    sql`WITH activity AS (
      SELECT ${posts.authorId} AS user_id, 1 AS p, 0 AS c, 0 AS v
      FROM posts
      WHERE ${publiclyVisible}
        AND (${since} IS NULL OR ${posts.createdAt} >= ${since})
      UNION ALL
      SELECT comments.author_id AS user_id, 0 AS p, 1 AS c, 0 AS v
      FROM comments
      JOIN posts ON posts.id = comments.post_id
      WHERE comments.hidden_at IS NULL
        AND ${publiclyVisible}
        AND (${since} IS NULL OR comments.created_at >= ${since})
      UNION ALL
      SELECT votes.user_id AS user_id, 0 AS p, 0 AS c, 1 AS v
      FROM votes
      JOIN posts ON posts.id = votes.post_id
      WHERE ${publiclyVisible}
        AND (${since} IS NULL OR votes.created_at >= ${since})
    )
    SELECT
      user.id AS id,
      user.name AS name,
      SUM(activity.p) AS posts,
      SUM(activity.c) AS comments,
      SUM(activity.v) AS votes
    FROM activity
    JOIN user ON user.id = activity.user_id
    WHERE COALESCE(user.is_anonymous, 0) = 0
      AND user.banned_at IS NULL
    GROUP BY user.id, user.name
    ORDER BY (SUM(activity.p) + SUM(activity.c) + SUM(activity.v)) DESC, SUM(activity.p) DESC, SUM(activity.c) DESC, user.id ASC
    LIMIT 5`,
  ];

  const [summaryRes, volumeRes, responseRes, deliveryRes, popularRes, contributorsRes] =
    await d1.batch(statements.map((statement) => prepare(d1, statement)));

  const summary = ((summaryRes!.results as SummaryRow[])[0] ?? {
    posts_in_range: 0,
    shipped_in_range: 0,
    status_open: 0,
    status_planned: 0,
    status_in_progress: 0,
    status_done: 0,
    status_closed: 0,
    cat_feature: 0,
    cat_bug: 0,
    cat_general: 0,
  }) as SummaryRow;

  const volume = buildVolumeSeries(volumeRes!.results as VolumeRow[], range, since, now);
  const responseMedianMs = median(
    (responseRes!.results as DurationRow[]).map((row) => Number(row.duration_ms)),
  );
  const deliveryMedianMs = median(
    (deliveryRes!.results as DurationRow[]).map((row) => Number(row.duration_ms)),
  );

  const popularRequests: AdminInsightsPopularRequest[] = (popularRes!.results as PopularRow[]).map(
    (row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      votes: Number(row.votes),
      comments: Number(row.comments),
      priority: row.priority === null ? null : Number(row.priority),
      createdAt: new Date(Number(row.created_at)).toISOString(),
    }),
  );

  const topContributors: AdminInsightsContributor[] = (
    contributorsRes!.results as ContributorRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    posts: Number(row.posts),
    comments: Number(row.comments),
    votes: Number(row.votes),
  }));

  return {
    range,
    totals: {
      posts: Number(summary.posts_in_range),
      votes: volume.votes,
      comments: volume.comments,
      shipped: Number(summary.shipped_in_range),
    },
    statusBreakdown: {
      open: Number(summary.status_open),
      planned: Number(summary.status_planned),
      in_progress: Number(summary.status_in_progress),
      done: Number(summary.status_done),
      closed: Number(summary.status_closed),
    },
    categoryBreakdown: {
      feature: Number(summary.cat_feature),
      bug: Number(summary.cat_bug),
      general: Number(summary.cat_general),
    },
    timing: {
      medianFirstResponseHours:
        responseMedianMs === null ? null : round1(responseMedianMs / HOUR_MS),
      medianTimeToDeliveryDays:
        deliveryMedianMs === null ? null : round1(deliveryMedianMs / DAY_MS),
    },
    volumeSeries: volume.series,
    popularRequests,
    topContributors,
  };
}
