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
