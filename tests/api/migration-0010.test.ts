import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vite-plus/test";

it("adds GitHub release identity without changing portal entries or their links", () => {
  const dir = new URL("../../migrations/", import.meta.url);
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (file.startsWith("0010_")) break;
      database.exec(readFileSync(new URL(file, dir), "utf8"));
    }
    database.exec(`
      INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('author', 'Ada', 'ada@example.invalid', 1, 1);
      INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES ('post', 'author', 'Post', 'Body', 'bug', 1, 1);
      INSERT INTO changelog_entries (id, title, body, status, published_at, created_at, updated_at) VALUES ('entry', 'Portal entry', 'Notes', 'published', 1, 1, 1);
      INSERT INTO changelog_posts VALUES ('entry', 'post');
    `);
    const before = database.prepare("SELECT * FROM changelog_entries").get();
    database.exec(readFileSync(new URL("0010_github_releases.sql", dir), "utf8"));
    expect(database.prepare("SELECT * FROM changelog_entries").get()).toEqual({
      ...before,
      github_release_id: null,
      github_repo: null,
      github_url: null,
      github_notified_at: null,
    });
    expect(database.prepare("SELECT * FROM changelog_posts").all()).toEqual([
      { entry_id: "entry", post_id: "post" },
    ]);
    database.exec(
      `INSERT INTO changelog_entries (id, title, body, github_repo, github_release_id, created_at, updated_at) VALUES ('release', 'Release', '', 'acme/app', 1, 1, 1)`,
    );
    expect(() =>
      database.exec(
        `INSERT INTO changelog_entries (id, title, body, github_repo, github_release_id, created_at, updated_at) VALUES ('duplicate', 'Release', '', 'acme/app', 1, 1, 1)`,
      ),
    ).toThrow(/UNIQUE/);
  } finally {
    database.close();
  }
});
