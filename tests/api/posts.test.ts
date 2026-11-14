import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv, flushWaitUntil, queue } from "../fixtures/cloudflare-workers.ts";
import { createAuth } from "../../src/server/auth.ts";
import { createPostForUser, getPostDetail } from "../../src/server/posts.ts";
import { addCommentForUser } from "../../src/server/comments.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import type { ViewerUser } from "../../src/contracts/domain.ts";

beforeEach(resetEnv);
async function writer(): Promise<ViewerUser> {
  const user = await (
    await createAuth().$context
  ).internalAdapter.createUser(
    { name: "Ada", email: `${crypto.randomUUID()}@example.com`, emailVerified: false },
    { method: "test" },
  );
  return { id: user.id, name: user.name, kind: "account" };
}
export function form(id = crypto.randomUUID()) {
  const form = new FormData();
  Object.entries({
    id,
    title: "Useful feature",
    body: "A public description",
    category: "feature",
  }).forEach(([k, v]) => form.set(k, v));
  return form;
}
it("creates once under concurrency, returns an identical replay, and leaves a sync outbox", async () => {
  const user = await writer();
  const data = form();
  const id = data.get("id") as string;
  const created = await Promise.all([createPostForUser(data, user), createPostForUser(data, user)]);
  expect(created.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 201]);
  expect(created[0].data).toEqual(created[1].data);
  expect(await getPostDetail(id, user)).toMatchObject({
    id,
    votes: 0,
    comments: 0,
    status: "open",
    author: { name: "Ada" },
  });
  expect(
    await env.DB.prepare(
      "SELECT revision, notion_revision, notion_page_id, github_requested FROM posts WHERE id = ?",
    )
      .bind(id)
      .first(),
  ).toEqual({ revision: 1, notion_revision: 0, notion_page_id: null, github_requested: 0 });
  await flushWaitUntil();
  expect(queue.sent).toContainEqual({ type: "notion.post", postId: id });
  await expect(createPostForUser(data, await writer())).rejects.toMatchObject({ code: "conflict" });
});
it("keeps votes and comments idempotent, revising the sync outbox only for changes", async () => {
  const user = await writer();
  const data = form();
  const postId = data.get("id") as string;
  await createPostForUser(data, user);
  expect(await setVoteForUser({ postId, voted: true }, user)).toEqual({
    votes: 1,
    viewerHasVoted: true,
  });
  await setVoteForUser({ postId, voted: true }, user);
  const comment = { id: crypto.randomUUID(), postId, body: "Helpful detail" };
  expect(await addCommentForUser(comment, user)).toEqual(await addCommentForUser(comment, user));
  expect(await getPostDetail(postId, user)).toMatchObject({ votes: 1, comments: 1 });
  expect(await env.DB.prepare("SELECT revision FROM posts").first()).toEqual({ revision: 3 });
});
