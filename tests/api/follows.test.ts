import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";

import type { ViewerUser } from "../../src/contracts/domain.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { addCommentForUser } from "../../src/server/comments.ts";
import { setFollowForUser } from "../../src/server/follows.ts";
import { createPostForUser, getPostDetail } from "../../src/server/posts.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { form, writer } from "./helpers.ts";

beforeEach(async () => {
  await resetEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await resetEnv();
});

const followRow = (postId: string, userId: string) =>
  env.DB.prepare("SELECT following FROM post_follows WHERE post_id = ? AND user_id = ?")
    .bind(postId, userId)
    .first<{ following: number }>();

async function makePost(author: ViewerUser) {
  const data = form();
  const id = data.get("id") as string;
  await createPostForUser(data, author);
  return id;
}

describe("migration 0011", () => {
  it("adds post_follows without disturbing existing rows and enforces following check + cascade", () => {
    const dir = new URL("../../migrations/", import.meta.url);
    const database = new DatabaseSync(":memory:");
    try {
      database.exec("PRAGMA foreign_keys = ON");
      for (const file of readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        if (file.startsWith("0011_")) break;
        database.exec(readFileSync(new URL(file, dir), "utf8"));
      }
      database.exec(`
        INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u1', 'Ada', 'ada@example.invalid', 1, 1);
        INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES ('p1', 'u1', 'Post', 'Body', 'bug', 1, 1);
      `);
      database.exec(readFileSync(new URL("0011_post_follows.sql", dir), "utf8"));
      database.exec(
        "INSERT INTO post_follows (post_id, user_id, following, updated_at) VALUES ('p1', 'u1', 1, 1)",
      );
      expect(() =>
        database.exec(
          "INSERT INTO post_follows (post_id, user_id, following, updated_at) VALUES ('p1', 'u1', 2, 1)",
        ),
      ).toThrow(/CHECK/);
      database.exec("DELETE FROM posts WHERE id = 'p1'");
      expect(database.prepare("SELECT * FROM post_follows").all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe("post follows", () => {
  it("requires a signed-in non-anonymous non-banned account and a visible post", async () => {
    const author = await writer();
    const postId = await makePost(author);
    const anon: ViewerUser = { id: "anon-id", name: "Anonymous", kind: "anonymous" };
    const banned: ViewerUser = { ...(await writer()), banned: true };

    await expect(setFollowForUser({ postId, following: true }, null)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(setFollowForUser({ postId, following: true }, anon)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(setFollowForUser({ postId, following: true }, banned)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      setFollowForUser({ postId: crypto.randomUUID(), following: true }, await writer()),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      setFollowForUser({ postId, following: "yes" }, await writer()),
    ).rejects.toMatchObject({ code: "invalid_input" });

    const adm = await writer();
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(adm.id).run();
    await adminApi.setPostState(
      { ...adm, admin: true, kind: "account" },
      { postId, state: "hidden" },
    );
    await expect(
      setFollowForUser({ postId, following: true }, await writer()),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets users follow/unfollow without voting and exposes viewerIsFollowing on getPostDetail", async () => {
    const author = await writer();
    const follower = await writer();
    const outsider = await writer();
    const postId = await makePost(author);

    expect((await getPostDetail(postId, author)).viewerIsFollowing).toBe(true);
    expect((await getPostDetail(postId, follower)).viewerIsFollowing).toBe(false);
    expect((await getPostDetail(postId, null)).viewerIsFollowing).toBe(false);

    expect(await setFollowForUser({ postId, following: true }, follower)).toEqual({
      following: true,
    });
    expect(await followRow(postId, follower.id)).toEqual({ following: 1 });
    expect((await getPostDetail(postId, follower)).viewerHasVoted).toBe(false);
    expect((await getPostDetail(postId, follower)).viewerIsFollowing).toBe(true);

    expect(await setFollowForUser({ postId, following: false }, follower)).toEqual({
      following: false,
    });
    expect(await followRow(postId, follower.id)).toEqual({ following: 0 });
    expect((await getPostDetail(postId, follower)).viewerIsFollowing).toBe(false);

    // Outsider stays non-following.
    expect((await getPostDetail(postId, outsider)).viewerIsFollowing).toBe(false);
  });

  it("auto-follows on create, vote, and comment for account users without overwriting explicit unfollows", async () => {
    const author = await writer();
    const voter = await writer();
    const commenter = await writer();
    const anon: ViewerUser = { ...(await writer()), kind: "anonymous" };
    await env.DB.prepare("UPDATE user SET is_anonymous = 1 WHERE id = ?").bind(anon.id).run();

    const postId = await makePost(author);
    expect(await followRow(postId, author.id)).toEqual({ following: 1 });

    // Anonymous votes do not create follow rows.
    const adm = await writer();
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(adm.id).run();
    await adminApi.saveSettings({ ...adm, admin: true, kind: "account" }, { anonymous: true });
    await setVoteForUser({ postId, voted: true }, anon);
    expect(await followRow(postId, anon.id)).toBeNull();

    // Upvoting creates a follow row; unvoting does not delete it, explicit unfollow sticks across re-vote & comment.
    await setVoteForUser({ postId, voted: true }, voter);
    expect(await followRow(postId, voter.id)).toEqual({ following: 1 });
    await setVoteForUser({ postId, voted: false }, voter);
    expect(await followRow(postId, voter.id)).toEqual({ following: 1 });

    await setFollowForUser({ postId, following: false }, voter);
    expect(await followRow(postId, voter.id)).toEqual({ following: 0 });

    await setVoteForUser({ postId, voted: true }, voter);
    await addCommentForUser({ id: crypto.randomUUID(), postId, body: "Checking in" }, voter);
    expect(await followRow(postId, voter.id)).toEqual({ following: 0 });

    // Fresh commenter auto-follows on a published comment.
    await addCommentForUser({ id: crypto.randomUUID(), postId, body: "Me too" }, commenter);
    expect(await followRow(postId, commenter.id)).toEqual({ following: 1 });
  });

  it("moves active follows when merging posts and respects existing target unfollows", async () => {
    const author = await writer();
    const srcFollower = await writer();
    const unfollowedTarget = await writer();
    const adm = await writer();
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(adm.id).run();

    const sourceId = await makePost(author);
    const targetId = await makePost(author);

    await setFollowForUser({ postId: sourceId, following: true }, srcFollower);
    await setFollowForUser({ postId: sourceId, following: true }, unfollowedTarget);
    await setFollowForUser({ postId: targetId, following: false }, unfollowedTarget);

    await adminApi.mergePost({ ...adm, admin: true, kind: "account" }, { sourceId, targetId });

    expect(await followRow(targetId, srcFollower.id)).toEqual({ following: 1 });
    expect(await followRow(targetId, unfollowedTarget.id)).toEqual({ following: 0 });
    expect(await followRow(sourceId, srcFollower.id)).toBeNull();
  });
});
