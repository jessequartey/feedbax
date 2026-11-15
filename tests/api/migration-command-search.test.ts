import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";

const dir = new URL("../../migrations/", import.meta.url);
const migration = "0008_command_search.sql";

describe("command search additive migration", () => {
  it("backfills a populated 0.3.1 database without changing source rows", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const file of readdirSync(dir)
        .filter((file) => file.endsWith(".sql") && file < migration)
        .sort()) {
        db.exec(readFileSync(new URL(file, dir), "utf8"));
      }
      db.exec(`
        INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u', 'Test', 'test@example.com', 1, 1);
        INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at)
          VALUES ('p', 'u', 'Existing idea', '**Already** here', 'feature', 1, 1);
        INSERT INTO changelog_entries (id, title, body, status, published_at, created_at, updated_at)
          VALUES ('e', 'Existing release', '[Already](https://invisible.example) shipped', 'published', 1, 1, 1);
      `);
      const posts = db.prepare("SELECT * FROM posts").all();
      const entries = db.prepare("SELECT * FROM changelog_entries").all();
      db.exec(readFileSync(new URL(migration, dir), "utf8"));
      expect(db.prepare("SELECT * FROM posts").all()).toEqual(posts);
      expect(db.prepare("SELECT * FROM changelog_entries").all()).toEqual(entries);
      expect(
        db
          .prepare("SELECT id FROM portal_search WHERE portal_search MATCH 'already*' ORDER BY id")
          .all(),
      ).toEqual([{ id: "e" }, { id: "p" }]);
      expect(
        db.prepare("SELECT id FROM portal_search WHERE portal_search MATCH 'invisible*'").all(),
      ).toEqual([]);
      expect(db.prepare("SELECT * FROM portal_search_input").all()).toEqual([]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      db.exec("INSERT INTO portal_search(portal_search) VALUES ('integrity-check')");
    } finally {
      db.close();
    }
  });
});
