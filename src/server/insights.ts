import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type {
  AdminInsights,
  AdminInsightsContributor,
  AdminInsightsPopularRequest,
  AdminInsightsVolumePoint,
  InsightsRange,
} from "../contracts/admin.ts";
import type { Category, Status } from "../contracts/domain.ts";
import { comments, posts, votes } from "../db/schema.ts";
import { cachedInsights } from "./insights-cache.ts";
import { choice, record } from "./validation.ts";
import { publiclyVisible } from "./visibility.ts";

// Insights aggregate publicly visible posts (`publiclyVisible`: not hidden, not spam, not
// merged) and visible comments (`comments.hidden_at IS NULL`). Hidden, spam and merged
// posts are excluded so moderation noise and duplicate merges do not skew counts, timings,
// public request rankings, or contributor rankings. Anonymous users' activity counts in
// totals and volume series, while their identities are excluded from `topContributors`.
//
// Timing comes from stamps, never `posts.updated_at` (votes, comments and edits bump it):
// first response = earliest of `status_changed_at` (trigger, 0013), the first admin comment
// and a linked published changelog entry; delivery = `done_at` (trigger, 0013), then
// `github_closed_at`, then a linked published changelog entry. Posts with none of these are
// left out. Rows older than 0013 have no stamps, so only GitHub and changelog signals count.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const RANGE_DAYS: Record<Exclude<InsightsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
/** Stands in for "no signal" so MIN() ignores it (SQLite's scalar MIN returns NULL on any NULL). */
const NO_SIGNAL = 9_223_372_036_854_775_807n;

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
function prepare(d1: D1Database, statement: SQL) {
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

const round1 = (value: number) => Math.round(value * 10) / 10;

type SummaryRow = {
  posts_in_range: number;
  status_open: number;
  status_planned: number;
  status_in_progress: number;
  status_done: number;
  status_closed: number;
  cat_feature: number;
  cat_bug: number;
  cat_general: number;
};

type ActivityRow = {
  kind: "volume" | "contributor";
  /** A UTC day (`YYYY-MM-DD`) for volume rows, a user id for contributor rows. */
  bucket: string;
  name: string | null;
  posts: number;
  comments: number;
  votes: number;
};

/** One row per metric: how many posts it covers and their median, computed in SQL. */
type MedianRow = { n: number; median_ms: number | null };

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

function buildVolumeSeries(
  rows: ActivityRow[],
  range: InsightsRange,
  since: number | null,
  now: number,
): { series: AdminInsightsVolumePoint[]; votes: number; comments: number } {
  let votes = 0;
  let comments = 0;
  for (const row of rows) {
    votes += Number(row.votes);
    comments += Number(row.comments);
  }

  if (range === "all" && rows.length === 0) {
    return { series: [], votes, comments };
  }

  let mode: "day" | "week" | "month";
  let startKey: string;
  let endKey = utcDayKey(now);

  if (range === "all") {
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
  } else {
    // `since` is a UTC day start, so the first bucket is whole: 7d is 7 bars, 30d is 30.
    mode = range === "90d" ? "week" : "day";
    startKey = utcDayKey(since!);
  }

  // 90d weeks count from `since` (so the first one is whole and the last one ends today);
  // all-time weeks are calendar weeks starting on Monday.
  const weekStartMs = (dayKey: string) =>
    range === "90d"
      ? since! + Math.floor((utcDayMs(dayKey) - since!) / WEEK_MS) * WEEK_MS
      : utcWeekStartMs(dayKey);
  const bucketKeyForDay = (dayKey: string) =>
    mode === "day" ? dayKey : mode === "week" ? utcDayKey(weekStartMs(dayKey)) : dayKey.slice(0, 7);

  const counts = new Map<string, { posts: number; votes: number; comments: number }>();
  for (const row of rows) {
    const key = bucketKeyForDay(row.bucket);
    const entry = counts.get(key) ?? { posts: 0, votes: 0, comments: 0 };
    entry.posts += Number(row.posts);
    entry.votes += Number(row.votes);
    entry.comments += Number(row.comments);
    counts.set(key, entry);
  }

  const point = (label: string, date: string): AdminInsightsVolumePoint => {
    const entry = counts.get(date);
    return {
      label,
      date,
      posts: entry?.posts ?? 0,
      votes: entry?.votes ?? 0,
      comments: entry?.comments ?? 0,
    };
  };

  const series: AdminInsightsVolumePoint[] = [];
  if (mode === "day") {
    const endMs = utcDayMs(endKey);
    for (let ms = utcDayMs(startKey); ms <= endMs; ms += DAY_MS) {
      const date = utcDayKey(ms);
      series.push(point(formatDayLabel(date), date));
    }
  } else if (mode === "week") {
    const endMs = weekStartMs(endKey);
    for (let ms = weekStartMs(startKey); ms <= endMs; ms += WEEK_MS) {
      const date = utcDayKey(ms);
      series.push(point(formatDayLabel(date), date));
    }
  } else {
    const endMonth = endKey.slice(0, 7);
    for (let month = startKey.slice(0, 7); month <= endMonth; month = nextMonthKey(month)) {
      series.push(point(formatMonthLabel(month), month));
    }
  }

  return { series, votes, comments };
}

/**
 * The median duration in SQL, so one row comes back however many posts there are: count the
 * rows, then average the one or two in the middle. `signals` yields (created_at, at) once per
 * post (materialized, so a correlated lookup runs once); `at` is NULL when there is no signal.
 */
function medianStatement(signals: SQL, window: SQL = sql``): SQL {
  return sql`WITH signals AS MATERIALIZED (${signals}),
    durations AS (
      SELECT at - created_at AS ms FROM signals
      WHERE at IS NOT NULL AND at >= created_at${window}
    ),
    total AS (SELECT count(*) AS n FROM durations)
  SELECT
    (SELECT n FROM total) AS n,
    (SELECT avg(ms) FROM (
      SELECT ms FROM durations ORDER BY ms
      LIMIT 2 - ((SELECT n FROM total) % 2) OFFSET ((SELECT n FROM total) - 1) / 2
    )) AS median_ms`;
}

/**
 * Compute all admin insights in a single `env.DB.batch(...)` call (1 D1 round-trip,
 * 5 SQL statements, zero N+1s, zero idle cron cost). Cached per isolate for 5 minutes.
 */
export async function getInsights(
  input: unknown = {},
  now = Date.now(),
  d1: D1Database = env.DB,
): Promise<AdminInsights> {
  const data = input === undefined ? {} : record(input);
  const range: InsightsRange =
    data.range === undefined ? "30d" : choice(data.range, ["7d", "30d", "90d", "all"], "range");
  return cachedInsights(range, d1, now, () => loadInsights(range, now, d1));
}

async function loadInsights(
  range: InsightsRange,
  now: number,
  d1: D1Database,
): Promise<AdminInsights> {
  // Whole UTC days, today included, so the totals and the first bar start on the same day.
  const since =
    range === "all" ? null : Math.floor(now / DAY_MS) * DAY_MS - (RANGE_DAYS[range] - 1) * DAY_MS;
  // A plain `col >= ?` (nothing for "all"): a bound value inside an OR would stop SQLite
  // from using the created_at indexes.
  const inRange = (column: SQLWrapper) =>
    since === null ? sql`` : sql` AND ${column} >= ${since}`;

  // CROSS JOIN fixes the order: start from the post's own links (changelog_posts_post_idx).
  // Left to itself the planner walks every published entry for every post.
  const publishedAt = sql`(
    SELECT MIN(ce.published_at)
    FROM changelog_posts cp
    CROSS JOIN changelog_entries ce ON ce.id = cp.entry_id
    WHERE cp.post_id = ${posts.id}
      AND ce.status = 'published'
      AND ce.published_at IS NOT NULL
  )`;
  const noSignal = sql.raw(NO_SIGNAL.toString());

  const statements = [
    // 1. Posts in range + the all-time status and category breakdowns, in one pass.
    sql`SELECT
      ${since === null ? sql`count(*)` : sql`count(CASE WHEN ${posts.createdAt} >= ${since} THEN 1 END)`} AS posts_in_range,
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

    // 2. Everything people did in range, read once per table (votes and comments drive from
    //    their created_at index, then join to posts for visibility): per-day volume rows and
    //    the top 5 non-anonymous, non-banned contributors.
    sql`WITH activity AS MATERIALIZED (
      SELECT ${posts.authorId} AS user_id, ${posts.createdAt} AS ts, 1 AS p, 0 AS c, 0 AS v
      FROM posts
      WHERE ${publiclyVisible}${inRange(posts.createdAt)}
      UNION ALL
      SELECT ${comments.authorId}, ${comments.createdAt}, 0, 1, 0
      FROM comments
      JOIN posts ON posts.id = ${comments.postId}
      WHERE ${comments.hiddenAt} IS NULL
        AND ${publiclyVisible}${inRange(comments.createdAt)}
      UNION ALL
      SELECT ${votes.userId}, ${votes.createdAt}, 0, 0, 1
      FROM votes
      JOIN posts ON posts.id = ${votes.postId}
      WHERE ${publiclyVisible}${inRange(votes.createdAt)}
    )
    SELECT 'volume' AS kind,
      strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS bucket,
      NULL AS name, SUM(p) AS posts, SUM(c) AS comments, SUM(v) AS votes
    FROM activity
    GROUP BY bucket
    UNION ALL
    SELECT * FROM (
      SELECT 'contributor' AS kind, user.id AS bucket, user.name AS name,
        totals.p AS posts, totals.c AS comments, totals.v AS votes
      FROM (
        SELECT user_id, SUM(p) AS p, SUM(c) AS c, SUM(v) AS v FROM activity GROUP BY user_id
      ) totals
      JOIN user ON user.id = totals.user_id
      WHERE COALESCE(user.is_anonymous, 0) = 0
        AND user.banned_at IS NULL
      ORDER BY (totals.p + totals.c + totals.v) DESC, totals.p DESC, totals.c DESC, user.id ASC
      LIMIT 5
    )`,

    // 3. Median first response (ms) of posts created in range: the earliest of the first move
    //    off 'open', the first admin comment and a linked release. No signal, not counted.
    medianStatement(sql`SELECT
        ${posts.createdAt} AS created_at,
        NULLIF(MIN(
          COALESCE(${posts.statusChangedAt}, ${noSignal}),
          COALESCE((SELECT MIN(c.created_at)
            FROM comments c
            JOIN user u ON u.id = c.author_id
            WHERE c.post_id = ${posts.id}
              AND c.hidden_at IS NULL
              AND u.role = 'admin'), ${noSignal}),
          COALESCE(${publishedAt}, ${noSignal})
        ), ${noSignal}) AS at
      FROM posts
      WHERE ${publiclyVisible}${inRange(posts.createdAt)}`),

    // 4. Posts shipped in range (n) and their median time to delivery (ms).
    medianStatement(
      sql`SELECT
        ${posts.createdAt} AS created_at,
        COALESCE(${posts.doneAt}, ${posts.githubClosedAt}, ${publishedAt}) AS at
      FROM posts
      WHERE ${publiclyVisible}
        AND ${posts.status} = 'done'`,
      since === null ? sql`` : sql` AND at >= ${since}`,
    ),

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
  ];

  const [summaryRes, activityRes, responseRes, deliveryRes, popularRes] = await d1.batch(
    statements.map((statement) => prepare(d1, statement)),
  );

  const summary = ((summaryRes!.results as SummaryRow[])[0] ?? {
    posts_in_range: 0,
    status_open: 0,
    status_planned: 0,
    status_in_progress: 0,
    status_done: 0,
    status_closed: 0,
    cat_feature: 0,
    cat_bug: 0,
    cat_general: 0,
  }) as SummaryRow;

  const activity = activityRes!.results as ActivityRow[];
  const volume = buildVolumeSeries(
    activity.filter((row) => row.kind === "volume"),
    range,
    since,
    now,
  );
  const response = (responseRes!.results as MedianRow[])[0];
  const delivery = (deliveryRes!.results as MedianRow[])[0];

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

  const topContributors: AdminInsightsContributor[] = activity
    .filter((row) => row.kind === "contributor")
    .map((row) => ({
      id: row.bucket,
      name: row.name ?? "",
      posts: Number(row.posts),
      comments: Number(row.comments),
      votes: Number(row.votes),
    }));

  return {
    range,
    generatedAt: new Date(now).toISOString(),
    totals: {
      posts: Number(summary.posts_in_range),
      votes: volume.votes,
      comments: volume.comments,
      shipped: Number(delivery?.n ?? 0),
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
        response?.median_ms == null ? null : round1(Number(response.median_ms) / HOUR_MS),
      medianTimeToDeliveryDays:
        delivery?.median_ms == null ? null : round1(Number(delivery.median_ms) / DAY_MS),
    },
    volumeSeries: volume.series,
    popularRequests,
    topContributors,
  };
}
