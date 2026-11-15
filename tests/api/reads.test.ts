import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { form, writer } from "./helpers.ts";
import { createPostForUser, getPostDetail, listPostPage } from "../../src/server/posts.ts";
import { addCommentForUser, listCommentPage } from "../../src/server/comments.ts";
import { setVoteForUser } from "../../src/server/votes.ts";

beforeEach(resetEnv);
it("escapes LIKE wildcards, filters, paginates, and exposes only public fields", async () => {
  const user = await writer(),
    other = await writer();
  const a = form(),
    b = form(),
    c = form();
  a.set("title", "100%_test\\");
  a.set("body", "😀 ".repeat(181));
  b.set("category", "bug");
  c.set("category", "bug");
  await createPostForUser(a, user);
  await createPostForUser(b, user);
  await createPostForUser(c, other);
  const found = await listPostPage({ q: "%_test\\" }, user);
  expect(found.total).toBe(1);
  expect(found.items[0].id).toBe(a.get("id"));
  expect(Array.from(found.items[0].excerpt).length).toBe(181);
  expect(found.items[0].excerpt.endsWith("…")).toBe(true);
  expect(found.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  const page = await listPostPage({ category: "bug", sort: "new", limit: 1 }, user);
  expect(page).toMatchObject({ total: 2, page: 1, limit: 1, hasMore: true });
  expect(
    (await listPostPage({ category: "bug", sort: "new", page: 2, limit: 1 }, user)).hasMore,
  ).toBe(false);
  expect((await listPostPage({}, user, true)).total).toBe(2);
  expect((await listPostPage({}, null, true)).total).toBe(0);
  const publicData = JSON.stringify(await getPostDetail(a.get("id") as string, null));
  for (const key of [
    "email",
    "hostSubject",
    "host_subject",
    "ipAddress",
    "notionRevision",
    "revision",
  ])
    expect(publicData).not.toContain(`"${key}"`);
});
it("sorts top by lifetime votes, trending by seven-day votes, then new by timestamp and UUID", async () => {
  const user = await writer(),
    voter = await writer(),
    another = await writer();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const data = form();
    ids.push(data.get("id") as string);
    await createPostForUser(data, user);
  }
  await setVoteForUser({ postId: ids[0], voted: true }, voter);
  await setVoteForUser({ postId: ids[0], voted: true }, another);
  await setVoteForUser({ postId: ids[1], voted: true }, voter);
  await env.DB.prepare("UPDATE votes SET created_at = ? WHERE post_id = ?")
    .bind(Date.now() - 8 * 86400000, ids[0])
    .run();
  for (let i = 0; i < ids.length; i++)
    await env.DB.prepare("UPDATE posts SET created_at = ? WHERE id = ?")
      .bind(1000 + i, ids[i])
      .run();
  expect((await listPostPage({ sort: "new" }, null)).items.map((p) => p.id)).toEqual([
    ids[2],
    ids[1],
    ids[0],
  ]);
  expect((await listPostPage({ sort: "top" }, null)).items.map((p) => p.id)).toEqual([
    ids[0],
    ids[1],
    ids[2],
  ]);
  expect((await listPostPage({}, null)).items.map((p) => p.id)).toEqual([ids[1], ids[2], ids[0]]);
  expect((await getPostDetail(ids[1], voter)).viewerHasVoted).toBe(true);
  expect((await getPostDetail(ids[1], user)).viewerHasVoted).toBe(false);

  // Trending weights vote recency: an equally-voted post with a newer vote outranks an older one.
  await setVoteForUser({ postId: ids[2], voted: true }, voter);
  await env.DB.prepare("UPDATE votes SET created_at = ? WHERE post_id = ?")
    .bind(Date.now() - 6 * 86400000, ids[1])
    .run();
  const trending = (await listPostPage({ sort: "trending" }, null)).items.map((p) => p.id);
  expect(trending.slice(0, 2)).toEqual([ids[2], ids[1]]);

  // Done and closed posts sort after active ones for every sort, however popular or new.
  await env.DB.prepare("UPDATE posts SET status = 'done', created_at = 5000 WHERE id = ?")
    .bind(ids[0])
    .run();
  await setVoteForUser({ postId: ids[0], voted: true }, user);
  await setVoteForUser({ postId: ids[0], voted: true }, voter);
  for (const sort of ["trending", "top", "new"] as const)
    for (const mine of [false, true]) {
      const items = (await listPostPage({ sort }, mine ? user : null, mine)).items;
      expect(items.at(-1)!.id, `${sort} mine=${mine}`).toBe(ids[0]);
    }
  await env.DB.prepare("UPDATE posts SET status = 'closed' WHERE id = ?").bind(ids[0]).run();
  expect((await listPostPage({ sort: "new" }, null)).items.at(-1)!.id).toBe(ids[0]);
});
it("orders comments ascending with deterministic UUID ties and returns notFound for missing reads", async () => {
  const user = await writer(),
    data = form();
  await createPostForUser(data, user);
  const postId = data.get("id") as string;
  for (let i = 0; i < 22; i++)
    await addCommentForUser({ id: crypto.randomUUID(), postId, body: `Comment ${i}` }, user);
  await env.DB.prepare("UPDATE comments SET created_at = 1000").run();
  const first = await listCommentPage({ postId }),
    second = await listCommentPage({ postId, page: 2 });
  expect(first).toMatchObject({ total: 22, hasMore: true });
  expect(second.items).toHaveLength(2);
  const ids = [...first.items, ...second.items].map((c) => c.id);
  expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  await expect(getPostDetail(crypto.randomUUID(), null)).rejects.toMatchObject({
    isNotFound: true,
  });
  await expect(listCommentPage({ postId: crypto.randomUUID() })).rejects.toMatchObject({
    isNotFound: true,
  });
});
it.each([
  { q: "x".repeat(101) },
  { limit: 51 },
  { page: 0 },
  { page: 1.5 },
  { category: "unknown" },
  { sort: "nope" },
  { status: "private" },
])("validates list input %j", async (input) => {
  await expect(listPostPage(input as never, null)).rejects.toMatchObject({ code: "invalid_input" });
});

it("reuses only synchronous DB wrappers, isolates bindings and observes fresh data and query parameters", async () => {
  const { createDb } = await import("../../src/db/client.ts");
  const { vi } = await import("vite-plus/test");
  const prepare = vi.fn(() => {
    throw new Error("construction performed I/O");
  });
  const binding = { prepare } as unknown as D1Database;
  expect(createDb(binding)).toBe(createDb(binding));
  expect(prepare).not.toHaveBeenCalled();
  const db = createDb(env.DB);
  expect(createDb(binding)).not.toBe(db);
  const one = await writer(),
    two = await writer();
  const find = (id: string) =>
    db.query.user.findFirst({ where: (fields, { eq }) => eq(fields.id, id) });
  const rows = await Promise.all([find(one.id), find(two.id)]);
  expect(rows.map((row) => row?.id)).toEqual([one.id, two.id]);
  await env.DB.prepare("UPDATE user SET name='Fresh name' WHERE id=?").bind(one.id).run();
  expect((await find(one.id))?.name).toBe("Fresh name");
  await resetEnv();
  expect(await db.query.user.findMany()).toEqual([]);
});
