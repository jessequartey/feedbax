import { sql } from "drizzle-orm";
import {
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
    notionRevision: integer("notion_revision").notNull().default(0),
    githubRequested: integer("github_requested").notNull().default(0),
    githubNumber: integer("github_number").unique(),
    githubUrl: text("github_url"),
    githubClosedAt: integer("github_closed_at"),
  },
  (t) => [
    check("posts_title_len", sql`length(${t.title}) BETWEEN 1 AND 120`),
    check("posts_body_len", sql`length(${t.body}) BETWEEN 1 AND 5000`),
    check("posts_category", sql`${t.category} IN ('feature', 'bug', 'general')`),
    check("posts_status", sql`${t.status} IN ('open', 'planned', 'in_progress', 'done', 'closed')`),
    check("posts_github_requested", sql`${t.githubRequested} IN (0, 1)`),
    index("posts_created_idx").on(t.createdAt, t.id),
    index("posts_status_created_idx").on(t.status, t.createdAt, t.id),
    index("posts_category_created_idx").on(t.category, t.createdAt, t.id),
    index("posts_author_created_idx").on(t.authorId, t.createdAt, t.id),
    // Cron sweep: the posts columns double as the sync outbox.
    index("posts_notion_pending")
      .on(t.id)
      .where(sql`${t.notionPageId} IS NULL OR ${t.notionRevision} < ${t.revision}`),
    index("posts_github_pending")
      .on(t.id)
      .where(sql`${t.githubRequested} = 1 AND ${t.githubNumber} IS NULL`),
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
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("votes_user_idx").on(t.userId)],
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

// Keys: notion.watermark, github.watermark, notion.error, github.error. `value` is JSON.
export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
