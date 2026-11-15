import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.ts";

export * from "./auth-schema.ts";

// Times are UTC integer milliseconds. Booleans are INTEGER 0/1. IDs are UUIDs.

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category", { enum: ["feature", "bug", "general"] }).notNull(),
    status: text("status", { enum: ["open", "planned", "in_progress", "done", "closed"] })
      .notNull()
      .default("open"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    revision: integer("revision").notNull().default(1),
    notionPageId: text("notion_page_id").unique(),
    notionBlocked: integer("notion_blocked").notNull().default(0),
    notionRevision: integer("notion_revision").notNull().default(0),
    githubRequested: integer("github_requested").notNull().default(0),
    githubNumber: integer("github_number").unique(),
    githubUrl: text("github_url"),
    githubClosedAt: integer("github_closed_at"),
    syncQueuedAt: integer("sync_queued_at").notNull().default(0),
    githubCreatorId: integer("github_creator_id"),
    // 0005 moderation actions. Nothing is deleted by hide/spam/merge.
    hiddenAt: integer("hidden_at"),
    spam: integer("spam").notNull().default(0),
    moderationReason: text("moderation_reason"),
    mergedInto: text("merged_into").references((): AnySQLiteColumn => posts.id),
    priority: integer("priority"),
    priorityUpdatedAt: integer("priority_updated_at"),
    notionPriority: integer("notion_priority"),
  },
  (t) => [
    check("posts_title_len", sql`length(${t.title}) BETWEEN 1 AND 120`),
    check("posts_body_len", sql`length(${t.body}) BETWEEN 1 AND 5000`),
    check("posts_category", sql`${t.category} IN ('feature', 'bug', 'general')`),
    check("posts_status", sql`${t.status} IN ('open', 'planned', 'in_progress', 'done', 'closed')`),
    check("posts_github_requested", sql`${t.githubRequested} IN (0, 1)`),
    check(
      "posts_priority",
      sql`${t.priority} IS NULL OR (typeof(${t.priority}) = 'integer' AND ${t.priority} BETWEEN 0 AND 100)`,
    ),
    index("posts_priority_created_idx").on(t.priority, t.createdAt, t.id),
    index("posts_created_idx").on(t.createdAt, t.id),
    index("posts_status_created_idx").on(t.status, t.createdAt, t.id),
    index("posts_category_created_idx").on(t.category, t.createdAt, t.id),
    index("posts_author_created_idx").on(t.authorId, t.createdAt, t.id),
    // Cron sweep: the posts columns double as the sync outbox.
    index("posts_notion_pending")
      .on(t.updatedAt, t.id)
      .where(
        sql`${t.notionBlocked} = 0 AND (${t.notionPageId} IS NULL OR ${t.notionRevision} < ${t.revision})`,
      ),
    index("posts_github_pending")
      .on(t.id)
      .where(sql`${t.githubRequested} = 1 AND ${t.githubNumber} IS NULL`),
    // 0001: lets the cron skip the GitHub poll when no linked issue is open.
    index("posts_github_open")
      .on(t.id)
      .where(sql`${t.githubNumber} IS NOT NULL AND ${t.githubClosedAt} IS NULL`),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    hiddenAt: integer("hidden_at"),
    moderationReason: text("moderation_reason"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check("comments_body_len", sql`length(${t.body}) BETWEEN 1 AND 2000`),
    index("comments_post_created_idx").on(t.postId, t.createdAt, t.id),
    // Not in the spec's list: serves the "30 comments per author per hour" indexed count.
    index("comments_author_created_idx").on(t.authorId, t.createdAt),
  ],
);

export const votes = sqliteTable(
  "votes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index("votes_user_idx").on(t.userId),
    // 0001: the trending sort counts a post's recent votes from this index alone.
    index("votes_post_created_idx").on(t.postId, t.createdAt),
  ],
);

export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    position: integer("position").notNull(),
    objectKey: text("object_key").notNull().unique(), // posts/<postId>/<position>
    mime: text("mime", { enum: ["image/png", "image/jpeg", "image/webp"] }).notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check("images_position", sql`${t.position} BETWEEN 0 AND 2`),
    check("images_mime", sql`${t.mime} IN ('image/png', 'image/jpeg', 'image/webp')`),
    uniqueIndex("images_post_position_uq").on(t.postId, t.position),
  ],
);

export const usedTokens = sqliteTable("used_tokens", {
  jti: text("jti").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});

// Provider state, email.error/digest, email.outbox/* and feedbax/* delivery tombstones.
// `value` is JSON; delivery payloads are discarded once terminal.
export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const voteBudget = sqliteTable("vote_budget", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  burstStart: integer("burst_start").notNull(),
  burstCount: integer("burst_count").notNull(),
  hourStart: integer("hour_start").notNull(),
  hourCount: integer("hour_count").notNull(),
});

// ---- 0005: admin foundation ----

// Runtime overrides for the safe feedbax.config.ts fields (src/server/settings.ts).
// `value` is JSON. Secrets never live here.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const changelogEntries = sqliteTable(
  "changelog_entries",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(), // markdown
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    publishedAt: integer("published_at"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    githubReleaseId: integer("github_release_id"),
    githubRepo: text("github_repo"),
    githubUrl: text("github_url"),
    githubNotifiedAt: integer("github_notified_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("changelog_title_len", sql`length(${t.title}) BETWEEN 1 AND 200`),
    check("changelog_body_len", sql`length(${t.body}) <= 20000`),
    check("changelog_status", sql`${t.status} IN ('draft', 'published')`),
    uniqueIndex("changelog_github_release_uq").on(t.githubRepo, t.githubReleaseId),
    index("changelog_status_published_idx").on(t.status, t.publishedAt, t.id),
  ],
);

export const changelogPosts = sqliteTable(
  "changelog_posts",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => changelogEntries.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.postId] }),
    index("changelog_posts_post_idx").on(t.postId),
  ],
);

export const webhookEndpoints = sqliteTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    secret: text("secret").notNull(), // per-endpoint HMAC key, generated by Feedbax
    events: text("events").notNull(), // JSON array of event names
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("webhook_endpoints_enabled", sql`${t.enabled} IN (0, 1)`)],
);

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: text("payload").notNull(),
    status: text("status", { enum: ["pending", "delivered", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("webhook_deliveries_status", sql`${t.status} IN ('pending', 'delivered', 'failed')`),
    index("webhook_deliveries_endpoint_created_idx").on(t.endpointId, t.createdAt),
  ],
);

// One row per user, created lazily (src/email/prefs.ts). No row = the defaults: changelog
// email is opt-in, the others are on. `unsubscribe_token` is a random per-row value kept for
// the column's NOT NULL UNIQUE contract; unsubscribe links are HMAC-signed instead
// (src/email/unsubscribe.ts), so sending never has to write a row first.
export const emailPrefs = sqliteTable("email_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  statusChanges: integer("status_changes").notNull().default(1),
  replies: integer("replies").notNull().default(1),
  changelog: integer("changelog").notNull().default(0),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  updatedAt: integer("updated_at").notNull(),
  // 0006: the daily admin digest. Only read for admins.
  digest: integer("digest").notNull().default(1),
});

// Single-use markers for signed admin sign-in links. A row exists only once a link is used.
export const adminLinkNonces = sqliteTable("admin_link_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at").notNull(),
});

// 0011: explicit follow/unfollow state per user and post.
// Absence of a row falls back to implicit following (author, voter, or commenter).
export const postFollows = sqliteTable(
  "post_follows",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    following: integer("following").notNull().default(1),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    check("post_follows_following", sql`${t.following} IN (0, 1)`),
    index("post_follows_user_idx").on(t.userId),
  ],
);
