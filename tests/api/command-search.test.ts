import { afterEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { handleSearch, searchExpression, searchPortal } from "../../src/server/search.ts";
import { normalizeMarkdown } from "../../src/lib/markdown-write.ts";
import { markdownToText } from "../../src/lib/markdown.ts";
import { measure } from "../resources/meter.ts";

afterEach(resetEnv);

async function post(id: string, title: string, body = "A useful idea", createdAt = 1) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user (id, name, email, created_at, updated_at) VALUES ('search-user', 'Search user', 'search@example.com', 1, 1)",
  ).run();
  await env.DB.prepare(
    "INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES (?, 'search-user', ?, ?, 'feature', ?, ?)",
  )
    .bind(id, title, normalizeMarkdown(body), createdAt, createdAt)
    .run();
}
async function entry(
  id: string,
  title: string,
  body: string,
  status = "published",
  publishedAt = 1,
) {
  await env.DB.prepare(
    "INSERT INTO changelog_entries (id, title, body, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)",
  )
    .bind(id, title, normalizeMarkdown(body), status, publishedAt)
    .run();
}
const ids = (hits: { id: string }[]) => hits.map((hit) => hit.id);

describe("command search", () => {
  it("matches prefixes across both groups and ranks title before body, then votes and recency", async () => {
    await post("body", "Another idea", "A command palette", 20);
    await post("older", "Command palette", "Useful", 1);
    await post("newer", "Command palette", "Useful", 10);
    await post("voted", "Command palette", "Useful", 2);
    await env.DB.prepare("INSERT INTO votes VALUES ('voted', 'search-user', 1)").run();
    await env.DB.prepare("INSERT INTO votes VALUES ('body', 'search-user', 1)").run();
    await entry("body-entry", "Other update", "A command palette", "published", 30);
    await entry("title-entry", "Command palette", "Useful");
    const result = await searchPortal("comm pal");
    expect(ids(result.feedback)).toEqual(["voted", "newer", "older", "body"]);
    expect(ids(result.changelog)).toEqual(["title-entry", "body-entry"]);
  });

  it("filters hidden, spam, merged posts and drafts before the result limit, including after moderation changes", async () => {
    await post("visible", "Needle");
    for (let i = 0; i < 10; i++) {
      await post(`hidden-${i}`, "Needle", "Hidden content", 20);
      await env.DB.prepare("UPDATE posts SET hidden_at = 1 WHERE id = ?").bind(`hidden-${i}`).run();
    }
    await post("spam", "Needle");
    await post("merged", "Needle");
    await env.DB.prepare("UPDATE posts SET spam = 1 WHERE id = 'spam'").run();
    await env.DB.prepare("UPDATE posts SET merged_into = 'visible' WHERE id = 'merged'").run();
    await entry("draft", "Needle", "Unpublished", "draft");
    await entry("published", "Needle", "Public");
    for (const query of ["needle", ""]) {
      const results = await searchPortal(query);
      expect(ids(results.feedback)).toEqual(["visible"]);
      expect(ids(results.changelog)).toEqual(["published"]);
    }
    await env.DB.prepare(
      "UPDATE changelog_entries SET status = 'draft' WHERE id = 'published'",
    ).run();
    expect((await searchPortal("needle")).changelog).toEqual([]);
  });

  it("keeps FTS current on insert, title/body update and delete for both sources", async () => {
    await post("post", "Before", "Before body");
    await entry("entry", "Before", "Before body");
    expect(ids((await searchPortal("before")).feedback)).toEqual(["post"]);
    expect(ids((await searchPortal("before")).changelog)).toEqual(["entry"]);
    for (const table of ["posts", "changelog_entries"]) {
      await env.DB.prepare(
        `UPDATE ${table} SET title = 'After', body = '**Updated** content'`,
      ).run();
    }
    expect(await searchPortal("before")).toEqual({ feedback: [], changelog: [] });
    expect(ids((await searchPortal("updated")).feedback)).toEqual(["post"]);
    expect(ids((await searchPortal("after")).changelog)).toEqual(["entry"]);
    await env.DB.prepare("DELETE FROM posts").run();
    await env.DB.prepare("DELETE FROM changelog_entries").run();
    expect(await searchPortal("updated")).toEqual({ feedback: [], changelog: [] });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM portal_search_input").first("n")).toBe(
      0,
    );
    expect(await env.DB.prepare("SELECT count(*) AS n FROM portal_search").first("n")).toBe(0);
  });

  it("indexes the visible Markdown words, not link destinations or fence info", async () => {
    await post(
      "markdown",
      "Formatting",
      "### **really** slow\n\nRead [the guide](https://secret-destination.example) for pre**fix**es.\n\n```typescript\nconst visible = true\n```",
    );
    for (const query of ["really slow", "guide", "prefix", "visible"]) {
      expect(ids((await searchPortal(query)).feedback)).toEqual(["markdown"]);
    }
    for (const query of ["secret-destination", "https", "typescript"]) {
      expect((await searchPortal(query)).feedback).toEqual([]);
    }
    expect((await searchPortal("guide")).feedback[0]?.excerpt).not.toContain("https");
  });

  it("projects canonical Markdown with the same word boundaries as the shared parser", async () => {
    const examples = [
      "pre**fix**es and *italic* words",
      "**bold _nested_** and __strong__",
      "snake_case and café_au_lait",
      "pre[fix](https://destination.example)suffix",
      "[**bold** label](https://example.com/a(b))",
      "[empty](javascript:alert(1))",
      "a`code`b",
      "`a*b` and `` `tick` ``",
      "`[literal](https://code.example)`",
      "\\*literal\\* \\[brackets\\]",
      "### Heading\n\n> Quoted\n\n- list item",
      "```typescript\nconst foo_bar = '[literal](url)'\n```",
      "**a**_b_**c**",
      "emoji 🐱 and 中文搜索",
      "**café** et **déjà**",
      "\\#literal text",
      "7. First item\n8. Second item",
      "**bold**_italic_ and *em*__strong__",
      "[a\\]b](https://example.com) and [code `x`](mailto:test@example.com)",
      "```\nA fence containing `` and \\*literal\\*\n```",
    ];
    const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (let i = 0; i < examples.length; i++) {
      const body = normalizeMarkdown(examples[i]!);
      await post(`parity-${i}`, "Parity", body);
      const projected = await env.DB.prepare("SELECT body FROM portal_search WHERE id = ?")
        .bind(`parity-${i}`)
        .first<string>("body");
      expect(words(projected!), body).toEqual(words(markdownToText(body, Infinity)));
    }
  });

  it("indexes maximum-length posts and changelog entries, including dense formatting", async () => {
    await post("long-post", "Long post", "word ".repeat(1000));
    await entry("long-entry", "Long release", "`*_*` ".repeat(3300));
    expect(ids((await searchPortal("word")).feedback)).toEqual(["long-post"]);
    expect((await searchPortal("long")).changelog).toHaveLength(1);
    const body = await env.DB.prepare(
      "SELECT body FROM portal_search WHERE id = 'long-entry'",
    ).first<string>("body");
    expect(body).toContain("*_*");
  });

  it("caps both groups, offers top posts when empty, and safely handles punctuation and FTS operators", async () => {
    for (let i = 0; i < 10; i++) {
      await post(`post-${i}`, "Needle", "Useful", i);
      await entry(`entry-${i}`, "Needle", "Useful", "published", i);
    }
    expect((await searchPortal("needle")).feedback).toHaveLength(8);
    expect((await searchPortal("needle")).changelog).toHaveLength(8);
    expect((await searchPortal("")).feedback).toHaveLength(5);
    expect((await searchPortal("")).changelog).toHaveLength(3);
    expect(await searchPortal('"* : ()')).toEqual({ feedback: [], changelog: [] });
    expect(searchExpression('needle OR "draft"')).toBe('"needle"* AND "OR"* AND "draft"*');
    expect(await searchPortal("needle OR draft")).toEqual({ feedback: [], changelog: [] });
  });

  it("uses two read-only statements per search and returns cacheable public GETs without auth", async () => {
    await post("post", "Needle");
    for (const query of ["needle", ""]) {
      const usage = await measure(() => searchPortal(query));
      expect(usage.queries).toBe(2);
      expect(usage.rowsWritten).toBe(0);
      expect(usage.fetches).toBe(0);
      expect(usage.queueSends).toBe(0);
    }
    const response = await handleSearch(new Request("https://example.com/api/search?q=needle"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=15");
    expect(response.headers.has("set-cookie")).toBe(false);
    const invalid = await handleSearch(
      new Request(`https://example.com/api/search?q=${"x".repeat(101)}`),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
  });
});
