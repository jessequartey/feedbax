import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { env, waitUntil } from "cloudflare:workers";
import { flushWaitUntil, queue, resetEnv } from "./cloudflare-workers.ts";
import { defineConfig } from "../../src/contracts/config.ts";
import { IntegrationError } from "../../src/contracts/integrations.ts";
import {
  CATEGORY_LABELS,
  LIMITS,
  STATUS_LABELS,
  type Category,
  type Status,
} from "../../src/contracts/domain.ts";
import { HOST_TOKEN_HEADER, HOST_TOKEN_TTL_SECONDS } from "../../src/contracts/host-token.ts";
import {
  fixtureCreatePost,
  fixtureGetPost,
  fixtureListComments,
  fixtureListMyPosts,
  fixtureListPosts,
  fixturePosts,
  fixtureRoadmap,
  fixtureSetVote,
  fixtureUsers,
} from "./portal.ts";

type Vector = {
  name: string;
  token: string;
  valid: boolean;
  claims?: { sub: string; name: string; exp: number; jti: string };
  mint?: { user: { id: string; name: string }; now: number; jti: string };
};
const vectors = JSON.parse(
  readFileSync(new URL("./host-tokens.json", import.meta.url), "utf8"),
) as {
  secret: string;
  now: number;
  header: string;
  vectors: Vector[];
};

const b64url = (b: Buffer) => b.toString("base64url");

describe("cloudflare:workers shim", () => {
  beforeEach(resetEnv);

  test("applies migrations: tables, partial indexes and constraints exist", async () => {
    const rows = await env.DB.prepare(
      "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
    ).all<{
      type: string;
      name: string;
    }>();
    const names = new Set(rows.results.map((r) => r.name));
    for (const table of [
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
    ]) {
      expect(names.has(table), table).toBe(true);
    }
    const partial = await env.DB.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN ('posts_notion_pending','posts_github_pending')",
    ).all<{ name: string; sql: string }>();
    expect(partial.results).toHaveLength(2);
    expect(partial.results.every((r) => /WHERE/i.test(r.sql))).toBe(true);
  });

  test("enforces foreign keys and CHECK constraints", async () => {
    const insert = env.DB.prepare(
      "INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)",
    );
    await expect(insert.bind("p1", "missing-user", "t", "b", "bug").run()).rejects.toThrow();
    await env.DB.prepare(
      "INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u1@example.com')",
    ).run();
    await expect(insert.bind("p1", "u1", "t", "b", "not-a-category").run()).rejects.toThrow();
    await insert.bind("p1", "u1", "t", "b", "bug").run();
    const row = await env.DB.prepare(
      "SELECT status, revision, notion_revision FROM posts WHERE id='p1'",
    ).first<{
      status: string;
      revision: number;
      notion_revision: number;
    }>();
    expect(row).toEqual({ status: "open", revision: 1, notion_revision: 0 });
  });

  test("host_subject is unique", async () => {
    const insert = env.DB.prepare(
      "INSERT INTO user (id, name, email, host_subject) VALUES (?, 'N', ?, 'same-subject')",
    );
    await insert.bind("a", "a@example.invalid").run();
    await expect(insert.bind("b", "b@example.invalid").run()).rejects.toThrow();
  });

  test("the pending sweep indexes select exactly the unsynced posts", async () => {
    await env.DB.prepare(
      "INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u1@example.com')",
    ).run();
    const ins = env.DB.prepare(
      "INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at, notion_page_id, notion_revision, revision, github_requested, github_number) VALUES (?, 'u1', 't', 'b', 'bug', 1, 1, ?, ?, ?, ?, ?)",
    );
    await env.DB.batch([
      ins.bind("new", null, 0, 1, 0, null), // never synced
      ins.bind("stale", "page", 1, 2, 0, null), // revision ahead of notion_revision
      ins.bind("synced", "page2", 2, 2, 0, null),
      ins.bind("gh-wanted", "page3", 1, 1, 1, null),
      ins.bind("gh-done", "page4", 1, 1, 1, 7),
    ]);
    const notion = await env.DB.prepare(
      "SELECT id FROM posts WHERE notion_page_id IS NULL OR notion_revision < revision ORDER BY id",
    ).all<{ id: string }>();
    expect(notion.results.map((r) => r.id)).toEqual(["new", "stale"]);
    const github = await env.DB.prepare(
      "SELECT id FROM posts WHERE github_requested = 1 AND github_number IS NULL",
    ).all<{ id: string }>();
    expect(github.results.map((r) => r.id)).toEqual(["gh-wanted"]);
  });

  test("R2 binding works and resetEnv empties it", async () => {
    await env.IMAGES.put("posts/x/0", new Uint8Array([1, 2, 3]));
    expect((await env.IMAGES.get("posts/x/0"))?.size).toBe(3);
    await resetEnv();
    expect(await env.IMAGES.get("posts/x/0")).toBeNull();
  });

  test("fake queue records sends and can fail on demand", async () => {
    await env.SYNC_QUEUE.send({ type: "notion.post", postId: "p" });
    expect(queue.sent).toEqual([{ type: "notion.post", postId: "p" }]);
    queue.failNext();
    await expect(env.SYNC_QUEUE.send({ type: "notion.post", postId: "q" })).rejects.toThrow();
    await env.SYNC_QUEUE.send({ type: "notion.post", postId: "r" });
    expect(queue.sent).toHaveLength(2);
  });

  test("waitUntil collects promises and flushWaitUntil awaits them", async () => {
    let done = false;
    waitUntil(
      new Promise((resolve) =>
        setTimeout(() => {
          done = true;
          resolve(undefined);
        }, 20),
      ),
    );
    expect(done).toBe(false);
    await flushWaitUntil();
    expect(done).toBe(true);
  });

  test("env carries test-only secrets, never real ones", () => {
    expect(env.NOTION_TOKEN).toContain("test_only");
    expect(env.FEEDBAX_HOST_SECRET).toBe(vectors.secret);
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});

describe("contracts", () => {
  const base = {
    integrations: { notion: { dataSourceId: "00000000-0000-0000-0000-000000000000" } },
  };

  test("defineConfig applies defaults", () => {
    expect(defineConfig(base)).toEqual({
      name: "Feedbax",
      appUrl: null,
      auth: { anonymous: false },
      integrations: {
        notion: { dataSourceId: base.integrations.notion.dataSourceId },
        github: false,
      },
    });
  });

  test("defineConfig accepts the full shape", () => {
    const config = defineConfig({
      name: "Acme Feedback",
      appUrl: "https://app.acme.com",
      auth: { anonymous: true },
      integrations: { notion: base.integrations.notion, github: { repo: "acme/product" } },
    });
    expect(config.integrations.github).toEqual({ repo: "acme/product" });
    expect(config.auth.anonymous).toBe(true);
  });

  test.each([
    ["name too long", { name: "x".repeat(61) }, "name"],
    ["empty name", { name: "" }, "name"],
    ["http appUrl", { appUrl: "http://app.acme.com" }, "appUrl"],
    ["relative appUrl", { appUrl: "/app" }, "appUrl"],
    ["appUrl with credentials", { appUrl: "https://u:p@app.acme.com" }, "appUrl"],
    ["non-boolean anonymous", { auth: { anonymous: "yes" } }, "auth.anonymous"],
    [
      "github URL instead of owner/repo",
      { integrations: { ...base.integrations, github: { repo: "https://github.com/a/b" } } },
      "integrations.github.repo",
    ],
    [
      "github repo without slash",
      { integrations: { ...base.integrations, github: { repo: "acme" } } },
      "integrations.github.repo",
    ],
    ["missing notion", { integrations: {} }, "integrations.notion.dataSourceId"],
    [
      "bad data source id",
      { integrations: { notion: { dataSourceId: "not-an-id" } } },
      "integrations.notion.dataSourceId",
    ],
  ])("defineConfig rejects: %s", (_label, patch, field) => {
    expect(() => defineConfig({ ...base, ...patch } as never)).toThrow(field);
  });

  test("defineConfig allows http for localhost and never echoes values", () => {
    expect(defineConfig({ ...base, appUrl: "http://localhost:5173" }).appUrl).toBe(
      "http://localhost:5173",
    );
    try {
      defineConfig({ ...base, appUrl: "http://secret-host.example" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("secret-host");
    }
  });

  test("IntegrationError carries provider, kind, status and retry delay", () => {
    const error = new IntegrationError("notion", "rate_limit", 429, 2000, "slow down");
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      provider: "notion",
      kind: "rate_limit",
      status: 429,
      retryAfterMs: 2000,
      message: "slow down",
    });
  });

  test("domain constants", () => {
    expect(Object.keys(STATUS_LABELS)).toEqual([
      "open",
      "planned",
      "in_progress",
      "done",
      "closed",
    ]);
    expect(Object.keys(CATEGORY_LABELS)).toEqual(["feature", "bug", "general"]);
    expect(LIMITS.images).toBe(3);
    expect(HOST_TOKEN_TTL_SECONDS).toBe(300);
    expect(HOST_TOKEN_HEADER).toBe('{"alg":"HS256","typ":"JWT"}');
  });
});

describe("host token fixtures", () => {
  const key = Buffer.from(vectors.secret, "base64url");

  function independentlyValid(token: string): boolean {
    if (token.length > 4096) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [h, p, s] = parts as [string, string, string];
    if (!/^[A-Za-z0-9_-]+$/.test(h + p + s)) return false;
    if (
      Buffer.from(h, "base64url").toString() !== HOST_TOKEN_HEADER ||
      b64url(Buffer.from(HOST_TOKEN_HEADER)) !== h
    )
      return false;
    const expected = createHmac("sha256", key).update(`${h}.${p}`).digest();
    const got = Buffer.from(s, "base64url");
    if (got.length !== expected.length || b64url(got) !== s || !timingSafeEqual(got, expected))
      return false;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>;
    const { sub, name, exp, jti } = claims;
    if (typeof sub !== "string" || sub.length < 1 || sub.length > 200 || /[\r\n]/.test(sub))
      return false;
    if (typeof name !== "string" || name.length < 1 || name.length > 80) return false;
    if (
      typeof jti !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jti)
    )
      return false;
    if (typeof exp !== "number") return false;
    return exp >= vectors.now - 30 && exp <= vectors.now + 330;
  }

  test("the vector file covers every required case", () => {
    const names = vectors.vectors.map((v) => v.name).join(" ");
    for (const needle of [
      "valid-basic",
      "unicode",
      "alg-none",
      "alg-hs512",
      "two-segments",
      "four-segments",
      "noncanonical",
      "bad-signature",
      "expired",
      "exp-too-far",
      "name-81",
      "sub-newline",
    ]) {
      expect(names, needle).toContain(needle);
    }
  });

  test.each(vectors.vectors.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    expect(independentlyValid(vector.token)).toBe(vector.valid);
    if (vector.mint) {
      const payload = JSON.stringify({
        sub: vector.mint.user.id,
        name: vector.mint.user.name,
        exp: vector.mint.now + HOST_TOKEN_TTL_SECONDS,
        jti: vector.mint.jti,
      });
      const h = b64url(Buffer.from(HOST_TOKEN_HEADER));
      const p = b64url(Buffer.from(payload));
      const sig = b64url(createHmac("sha256", key).update(`${h}.${p}`).digest());
      expect(`${h}.${p}.${sig}`).toBe(vector.token);
    }
  });
});

describe("portal fixtures", () => {
  test("every status and category appears, with anonymous and host authors", () => {
    expect(new Set(fixturePosts.map((p) => p.status))).toEqual(
      new Set<Status>(["open", "planned", "in_progress", "done", "closed"]),
    );
    expect(new Set(fixturePosts.map((p) => p.category))).toEqual(
      new Set<Category>(["feature", "bug", "general"]),
    );
    expect(fixturePosts.some((p) => p.author.anonymous)).toBe(true);
    expect(fixtureUsers.map((u) => u.kind).sort()).toEqual(["account", "anonymous", "host"]);
  });

  test("there is a post with two images and more than one page of posts", () => {
    expect(fixtureGetPost(fixturePosts[2]!.id)?.images).toHaveLength(2);
    const first = fixtureListPosts({ sort: "new" });
    expect(first).toMatchObject({ page: 1, limit: 20, hasMore: true });
    expect(first.total).toBeGreaterThan(40);
    expect(fixtureListPosts({ sort: "new", page: 3 }).hasMore).toBe(false);
    expect(fixtureListPosts({ limit: 500 }).limit).toBe(50);
  });

  test("filters, roadmap, comments and mutations behave", () => {
    expect(fixtureListPosts({ status: "done" }).items.every((p) => p.status === "done")).toBe(true);
    expect(fixtureListMyPosts({}).items.every((p) => p.author.name === "Ada Lovelace")).toBe(true);
    const roadmap = fixtureRoadmap({});
    expect(Object.keys(roadmap)).toEqual(["planned", "in_progress", "done"]);
    expect(roadmap.planned.total).toBeGreaterThan(0);
    expect(fixtureListComments(fixturePosts[2]!.id).items).toHaveLength(20);
    expect(fixtureListComments(fixturePosts[2]!.id, 2).hasMore).toBe(false);
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("title", "Hello");
    expect(fixtureCreatePost(form)).toMatchObject({ ok: true });
    expect(fixtureCreatePost(new FormData())).toMatchObject({ ok: false });
    expect(fixtureSetVote({ postId: "missing", voted: true })).toMatchObject({ ok: false });
  });

  test("excerpts cap at 180 code points with an ellipsis", () => {
    const long = fixtureListPosts({ q: "Anonymous bug report" }).items[0]!;
    expect(Array.from(long.excerpt)).toHaveLength(181);
    expect(long.excerpt.endsWith("…")).toBe(true);
  });
});
