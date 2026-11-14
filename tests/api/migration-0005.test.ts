// Migration 0005 must apply on top of a populated 0.3.0 (0000–0004) database without
// losing or rewriting data. D1 is SQLite, so this replays the migration files on
// node:sqlite with foreign keys on (as D1 enforces them), the same way wrangler applies them.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";

const dir = new URL("../../migrations/", import.meta.url);
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const read = (file: string) => readFileSync(new URL(file, dir), "utf8");
const apply = (db: DatabaseSync, file: string) => {
  db.exec("BEGIN");
  db.exec(read(file).replaceAll("--> statement-breakpoint", ""));
  db.exec("COMMIT");
};
const NEW_TABLES = [
  "settings",
  "changelog_entries",
  "changelog_posts",
  "webhook_endpoints",
  "webhook_deliveries",
  "email_prefs",
  "admin_link_nonces",
];
const OLD_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
  "posts",
  "comments",
  "votes",
  "images",
  "used_tokens",
  "sync_state",
  "vote_budget",
];

function v030() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const index = files.indexOf("0005_admin_foundation.sql");
  expect(index).toBe(5);
  for (const file of files.slice(0, index)) apply(db, file);
  // A populated 0.3.0 portal: host, account and anonymous users, a synced post with an
  // image, a comment, votes, budgets, sessions and sync state.
  db.exec(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at, is_anonymous, host_subject) VALUES
      ('u1', 'Ada', 'ada@example.com', 1, 1, 1, 0, NULL),
      ('u2', 'Host', 'host-x@users.feedbax.invalid', 0, 2, 2, 0, 'sub-1'),
      ('u3', 'Anonymous', 'anon@example.com', 0, 3, 3, 1, NULL);
    INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('s1', 9, 'tok', 1, 1, 'u1');
    INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES ('a1', '42', 'github', 'u1', 1, 1);
    INSERT INTO posts (id, author_id, title, body, category, status, created_at, updated_at, revision, notion_page_id, notion_revision, github_requested, github_number, github_url, github_closed_at, notion_blocked, sync_queued_at, github_creator_id)
      VALUES ('p1', 'u1', 'Dark mode', 'Please', 'feature', 'planned', 10, 11, 3, 'np1', 3, 1, 7, 'https://github.com/o/r/issues/7', NULL, 0, 12, 99),
             ('p2', 'u2', 'Crash', 'On save', 'bug', 'open', 20, 20, 1, NULL, 0, 0, NULL, NULL, NULL, 1, 0, NULL);
    INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES ('c1', 'p1', 'u2', 'Agreed', 30);
    INSERT INTO votes (post_id, user_id, created_at) VALUES ('p1', 'u2', 40), ('p1', 'u3', 41);
    INSERT INTO images (id, post_id, position, object_key, mime, bytes, width, height, created_at) VALUES ('i1', 'p1', 0, 'posts/p1/0', 'image/png', 10, 1, 1, 50);
    INSERT INTO used_tokens (jti, expires_at) VALUES ('j1', 60);
    INSERT INTO sync_state (key, value, updated_at) VALUES ('notion.watermark', '"2026-01-01T00:00:00.000Z"', 70);
    INSERT INTO vote_budget (user_id, burst_start, burst_count, hour_start, hour_count) VALUES ('u2', 1, 1, 1, 1);
    INSERT INTO rate_limit (id, key, count, last_request) VALUES ('r1', 'k', 1, 1);
    INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('v1', 'i', 'v', 1, 1, 1);
  `);
  return db;
}
const dump = (db: DatabaseSync, table: string) =>
  db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
const columns = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name);

describe("migration 0005", () => {
  it("is additive only", () => {
    const sql = read("0005_admin_foundation.sql")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    // ("ON DELETE"/"ON UPDATE" foreign-key actions are fine; data statements are not.)
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|^\s*UPDATE\b|\bRENAME\b|\bINSERT\b/im);
    for (const statement of sql.split("--> statement-breakpoint").map((s) => s.trim()))
      expect(statement).toMatch(
        /^(ALTER TABLE `\w+` ADD COLUMN|CREATE (UNIQUE )?INDEX|CREATE TABLE)/,
      );
  });
  it("applies on a populated 0004 database and keeps every 0.3.0 row and value", () => {
    const db = v030();
    const before = Object.fromEntries(OLD_TABLES.map((t) => [t, dump(db, t)]));
    const oldColumns = Object.fromEntries(OLD_TABLES.map((t) => [t, columns(db, t)]));
    apply(db, "0005_admin_foundation.sql");

    for (const table of OLD_TABLES) {
      const after = dump(db, table) as Record<string, unknown>[];
      // Every pre-existing column keeps its exact value; only new columns are added.
      expect(
        after.map((row) => Object.fromEntries(oldColumns[table].map((c) => [c, row[c]]))),
        table,
      ).toEqual(before[table]);
    }
    expect(dump(db, "user").map((u) => [(u as any).role, (u as any).banned_at])).toEqual([
      ["user", null],
      ["user", null],
      ["user", null],
    ]);
    expect(
      dump(db, "posts").map((p) => [(p as any).hidden_at, (p as any).spam, (p as any).merged_into]),
    ).toEqual([
      [null, 0, null],
      [null, 0, null],
    ]);
    for (const table of NEW_TABLES) expect(dump(db, table), table).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  });
  it("enforces the new constraints and relations", () => {
    const db = v030();
    apply(db, "0005_admin_foundation.sql");
    expect(() => db.exec("UPDATE user SET role = 'root' WHERE id = 'u1'")).toThrow(/CHECK/);
    db.exec("UPDATE user SET role = 'admin', banned_at = 5 WHERE id = 'u1'");
    expect(() => db.exec("UPDATE posts SET merged_into = 'missing' WHERE id = 'p2'")).toThrow(
      /FOREIGN KEY/,
    );
    db.exec("UPDATE posts SET merged_into = 'p1', hidden_at = 1, spam = 1 WHERE id = 'p2'");
    db.exec(`
      INSERT INTO changelog_entries (id, title, body, status, published_at, author_id, created_at, updated_at)
        VALUES ('e1', 'Shipped dark mode', '**Yes**', 'published', 1, 'u1', 1, 1);
      INSERT INTO changelog_posts (entry_id, post_id) VALUES ('e1', 'p1');
      INSERT INTO webhook_endpoints (id, url, secret, events, created_at, updated_at)
        VALUES ('w1', 'https://hooks.example.com', 's', '["post.created"]', 1, 1);
      INSERT INTO webhook_deliveries (id, endpoint_id, event, payload, created_at, updated_at)
        VALUES ('d1', 'w1', 'post.created', '{}', 1, 1);
      INSERT INTO email_prefs (user_id, unsubscribe_token, updated_at) VALUES ('u1', 'unsub-1', 1);
      INSERT INTO settings (key, value, updated_at) VALUES ('name', '"Acme"', 1);
      INSERT INTO admin_link_nonces (nonce, expires_at, used_at) VALUES ('n', 1, 1);
    `);
    expect(db.prepare("SELECT * FROM email_prefs").get()).toMatchObject({
      status_changes: 1,
      replies: 1,
      changelog: 0,
    });
    expect(() =>
      db.exec(
        "INSERT INTO changelog_entries (id, title, body, status, created_at, updated_at) VALUES ('e2', 't', 'b', 'live', 1, 1)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      db.exec(
        "INSERT INTO email_prefs (user_id, unsubscribe_token, updated_at) VALUES ('u2', 'unsub-1', 1)",
      ),
    ).toThrow(/UNIQUE/);
    // Deleting an endpoint drops its delivery log; deleting a user keeps their entries.
    db.exec("DELETE FROM webhook_endpoints WHERE id = 'w1'");
    expect(dump(db, "webhook_deliveries")).toEqual([]);
    db.exec("DELETE FROM email_prefs; DELETE FROM changelog_entries WHERE id = 'e1'");
    expect(dump(db, "changelog_posts")).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
