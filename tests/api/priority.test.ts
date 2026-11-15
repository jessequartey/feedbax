import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { createPostForUser, getPostDetail, listPostPage } from "../../src/server/posts.ts";
import { form, writer } from "./helpers.ts";
import { setPostPriority } from "../../src/server/moderation.ts";

beforeEach(resetEnv);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const stored = (id: string) =>
  env.DB.prepare("SELECT priority, priority_updated_at, revision FROM posts WHERE id = ?")
    .bind(id)
    .first();

test("migration preserves populated posts, defaults to null and enforces integer 0–100", () => {
  const dir = new URL("../../migrations/", import.meta.url);
  const database = new DatabaseSync(":memory:");
  try {
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files.filter((name) => name < "0009"))
      database.exec(readFileSync(new URL(name, dir), "utf8"));
    database.exec(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('u','Ada','fake@example.invalid',0,1,1)",
    );
    database.exec(
      "INSERT INTO posts (id,author_id,title,body,category,created_at,updated_at) VALUES ('p','u','Keep me','Body','feature',1,2)",
    );
    const before = database.prepare("SELECT * FROM posts").get();
    database.exec(readFileSync(new URL("0009_post_priority.sql", dir), "utf8"));
    expect(database.prepare("SELECT * FROM posts").get()).toEqual({
      ...before,
      priority: null,
      priority_updated_at: null,
      notion_priority: null,
    });
    for (const value of [-1, 101, 0.5, "bad"])
      expect(() => database.prepare("UPDATE posts SET priority = ?").run(value)).toThrow(/CHECK/);
    for (const value of [0, 100, null])
      database.prepare("UPDATE posts SET priority = ?").run(value);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='posts_priority_created_idx'",
        )
        .get(),
    ).toBeDefined();
  } finally {
    database.close();
  }
});

describe("admin priority", () => {
  test("set and clear require admin; reject invalid values without changing the post", async () => {
    const author = await writer();
    const actor = { ...author, admin: true as const };
    const data = form();
    const postId = data.get("id") as string;
    await createPostForUser(data, author);
    for (const viewer of [
      null,
      author,
      { ...actor, banned: true },
      { ...actor, kind: "anonymous" as const },
    ])
      await expect(
        adminApi.setPostPriority(viewer, { postId, priority: 100 }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/forbidden|unauthenticated/) });
    for (const priority of [-1, 101, 1.5, "25", undefined, NaN, true])
      await expect(adminApi.setPostPriority(actor, { postId, priority })).rejects.toMatchObject({
        code: "invalid_input",
        field: "priority",
      });
    expect(await stored(postId)).toMatchObject({ priority: null, revision: 1 });
    await adminApi.setPostPriority(actor, { postId, priority: 0 });
    expect(await stored(postId)).toMatchObject({
      priority: 0,
      revision: 2,
      priority_updated_at: expect.any(Number),
    });
    await adminApi.setPostPriority(actor, { postId, priority: 100 });
    expect(await getPostDetail(postId, actor)).toHaveProperty("priority", 100);
    await adminApi.setPostPriority(actor, { postId, priority: null });
    expect(await stored(postId)).toMatchObject({ priority: null, revision: 4 });
    await expect(
      adminApi.setPostPriority(actor, { postId: crypto.randomUUID(), priority: 10 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  test("sorts scored posts descending, then unscored, without leaking scores in public payloads", async () => {
    const author = await writer();
    const actor = { ...author, admin: true as const };
    const ids: string[] = [];
    for (const priority of [null, 0, 100]) {
      const data = form();
      const id = data.get("id") as string;
      ids.push(id);
      await createPostForUser(data, author);
      if (priority !== null) await setPostPriority({ postId: id, priority }, 100);
    }
    expect((await listPostPage({ sort: "priority" }, actor)).items.map((p) => p.id)).toEqual(
      [...ids].reverse(),
    );
    const moderation = await adminApi.listModerationPosts(actor, { sort: "priority" });
    expect(moderation.items.map((p) => p.priority)).toEqual([100, 0, null]);
    for (const viewer of [
      null,
      author,
      { ...actor, banned: true },
      { ...actor, kind: "anonymous" as const },
    ]) {
      await expect(listPostPage({ sort: "priority" }, viewer)).rejects.toMatchObject({
        code: expect.stringMatching(/forbidden|unauthenticated/),
      });
      for (const sort of ["new", "top", "trending"] as const)
        for (const item of (await listPostPage({ sort }, viewer)).items)
          expect(JSON.stringify(item)).not.toMatch(/priority/i);
      for (const id of ids)
        expect(JSON.stringify(await getPostDetail(id, viewer))).not.toMatch(/priority/i);
    }
  });
});
