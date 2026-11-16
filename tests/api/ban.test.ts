import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { requireWriter, viewerUser } from "../../src/server/auth.ts";
import { handleAuth, handleHostRevoke, handlePosts } from "../../src/server/http.ts";
import { createPostForUser } from "../../src/server/posts.ts";
import { addCommentForUser } from "../../src/server/comments.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import { form, mintToken } from "./helpers.ts";

beforeEach(resetEnv);
const ban = (id: string, at: number | null = Date.now()) =>
  env.DB.prepare("UPDATE user SET banned_at = ? WHERE id = ?").bind(at, id).run();
const count = async (table: string) =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
async function signIn(sub = "host-user") {
  const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken({ sub })}`;
  const response = await handleAuth(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  return new Headers({ cookie: response.headers.get("set-cookie")!.split(";")[0] });
}

it("a banned user can read but cannot post, vote or comment; unbanning restores writes", async () => {
  const headers = await signIn();
  const viewer = (await viewerUser(headers))!;
  expect(viewer.banned).toBeUndefined();
  const { data } = await createPostForUser(form(), viewer);

  await ban(viewer.id);
  const banned = (await viewerUser(headers))!;
  expect(banned).toMatchObject({ id: viewer.id, banned: true }); // still signed in
  const forbidden = { code: "forbidden" };
  await expect(createPostForUser(form(), banned)).rejects.toMatchObject(forbidden);
  await expect(setVoteForUser({ postId: data.postId, voted: true }, banned)).rejects.toMatchObject(
    forbidden,
  );
  await expect(
    addCommentForUser({ id: crypto.randomUUID(), postId: data.postId, body: "hi" }, banned),
  ).rejects.toMatchObject(forbidden);
  expect([await count("posts"), await count("votes"), await count("comments")]).toEqual([1, 0, 0]);

  await ban(viewer.id, null);
  const restored = (await viewerUser(headers))!;
  expect(restored.banned).toBeUndefined();
  await expect(setVoteForUser({ postId: data.postId, voted: true }, restored)).resolves.toEqual({
    votes: 1,
    viewerHasVoted: true,
  });
});
it("requireWriter rejects a banned viewer before any other check", () => {
  expect(() => requireWriter({ id: "u", name: "U", kind: "account", banned: true })).toThrow(
    expect.objectContaining({ code: "forbidden" }),
  );
});
it("blocks a banned host user on the bearer post API", async () => {
  const viewer = (await viewerUser(await signIn("banned-host")))!;
  await ban(viewer.id);
  const response = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { authorization: `Bearer ${await mintToken({ sub: "banned-host" })}` },
      body: form(),
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
  expect(await count("posts")).toBe(0);
});

it("a host token revokes that user's sessions once, and only theirs", async () => {
  const mine = await signIn("host-a");
  const other = await signIn("host-b");
  const token = await mintToken({ sub: "host-a" });
  const call = () =>
    handleHostRevoke(
      new Request(`${env.PORTAL_URL}/api/host/revoke`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
  expect((await call()).status).toBe(204);
  expect(await viewerUser(mine)).toBeNull();
  expect(await viewerUser(other)).not.toBeNull();
  expect((await call()).status).toBe(401); // replay
  expect(
    (await handleHostRevoke(new Request(`${env.PORTAL_URL}/api/host/revoke`, { method: "POST" })))
      .status,
  ).toBe(401);
});
