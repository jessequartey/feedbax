import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import config from "../../feedbax.config.ts";
import type { ViewerUser } from "../../src/contracts/domain.ts";
import { SYNTHETIC_ADMIN_ID, ensureSyntheticAdmin, grantAdmin } from "../../src/server/admin.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { viewerUser } from "../../src/server/auth.ts";
import { addCommentForUser, listCommentPage } from "../../src/server/comments.ts";
import { getPostDetail, listPostPage, createPostForUser } from "../../src/server/posts.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import { consumeQueue } from "../../src/sync/index.ts";
import { fakeFetch } from "../sync/helpers.ts";
import { handleAuth } from "../../src/server/http.ts";
import { form, mintToken, png, writer } from "./helpers.ts";

beforeEach(async () => {
  await resetEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  config.integrations.github = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const count = async (table: string, where = "1=1") =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<{
    n: number;
  }>())!.n;
const row = <T>(sql: string, ...binds: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...binds)
    .first<T>();
async function admin(): Promise<ViewerUser & { admin: true }> {
  const user = await writer();
  await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(user.id).run();
  return { ...user, admin: true };
}
async function post(author: ViewerUser, patch: { title?: string; images?: number } = {}) {
  const data = form();
  if (patch.title) data.set("title", patch.title);
  for (let i = 0; i < (patch.images ?? 0); i++) data.append("image", png());
  await createPostForUser(data, author);
  return data.get("id") as string;
}
const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

describe("the admin guard", () => {
  it("rejects every admin function for anyone who is not an admin, before changing anything", async () => {
    const author = await writer(),
      postId = await post(author);
    const banned = { ...(await admin()), banned: true as const };
    const anonymous = { ...(await admin()), kind: "anonymous" as const };
    const viewers: (ViewerUser | null)[] = [null, author, banned, anonymous];
    const inputs: Record<string, unknown> = {
      setPostState: { postId, state: "spam" },
      mergePost: { sourceId: postId, targetId: crypto.randomUUID() },
      deletePost: { postId },
      listPostVoters: { postId },
      sendToGitHub: { postId },
      setBanned: { userId: author.id, banned: true },
      setAdminRole: { userId: author.id, admin: true },
      saveSettings: { name: "Hijacked" },
    };
    const names = Object.keys(adminApi) as (keyof typeof adminApi)[];
    expect(names.length).toBeGreaterThanOrEqual(14);
    for (const name of names)
      for (const viewer of viewers)
        await expect(
          (adminApi[name] as (v: ViewerUser | null, input: unknown) => Promise<unknown>)(
            viewer,
            inputs[name] ?? {},
          ),
          `${name} as ${viewer?.name ?? "signed out"}`,
        ).rejects.toMatchObject({ code: expect.stringMatching(/^(unauthenticated|forbidden)$/) });
    // Nothing moved: the post is intact and visible, nobody is banned, no settings stored.
    expect(await row("SELECT hidden_at, spam FROM posts WHERE id = ?", postId)).toEqual({
      hidden_at: null,
      spam: 0,
    });
    expect(await count("user", "banned_at IS NOT NULL OR role = 'admin'")).toBe(2); // the two seeded admins
    expect(await count("settings")).toBe(0);
  });
  it("is the only way server functions reach the admin modules", () => {
    const source = readFileSync(new URL("../../src/server/functions.ts", import.meta.url), "utf8");
    for (const name of Object.keys(adminApi)) expect(source).toContain(`adminApi.${name}(`);
    expect(source).not.toMatch(/from "\.\/(moderation|user-admin)\.ts"/);
    // One admin server function per admin api entry.
    expect(source.match(/adminApi\.\w+\(/g)).toHaveLength(Object.keys(adminApi).length);
  });
  it("takes the role from D1 on every request, so a revoked admin is stopped at once", async () => {
    const response = await handleAuth(
      new Request(`${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`, {
        method: "POST",
        headers: { origin: env.PORTAL_URL },
      }),
    );
    const headers = new Headers({ cookie: response.headers.get("set-cookie")!.split(";")[0] });
    const signedIn = (await viewerUser(headers))!;
    await expect(adminApi.session(signedIn, undefined)).rejects.toMatchObject({
      code: "forbidden",
    });
    await grantAdmin(signedIn.id);
    const promoted = (await viewerUser(headers))!;
    await expect(adminApi.session(promoted, undefined)).resolves.toEqual({ name: promoted.name });
    await env.DB.prepare("UPDATE user SET role = 'user' WHERE id = ?").bind(signedIn.id).run();
    await expect(adminApi.session((await viewerUser(headers))!, undefined)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("hidden, spam and merged posts", () => {
  it("never appear in public lists, search, the roadmap or counts, but stay on My feedback", async () => {
    const author = await writer(),
      reader = await writer(),
      actor = await admin();
    const shown = await post(author, { title: "Shown idea" });
    const hidden = await post(author, { title: "Hidden idea" });
    const spam = await post(author, { title: "Spam idea" });
    const dupe = await post(author, { title: "Dupe idea" });
    await adminApi.setPostState(actor, { postId: hidden, state: "hidden" });
    await adminApi.setPostState(actor, { postId: spam, state: "spam" });
    await adminApi.mergePost(actor, { sourceId: dupe, targetId: shown });
    await env.DB.prepare("UPDATE posts SET status = 'planned'").run();

    const board = await listPostPage({}, reader);
    expect(ids(board)).toEqual([shown]);
    expect(board.total).toBe(1);
    expect(await listPostPage({ q: "idea" }, null)).toMatchObject({ total: 1 });
    expect(await listPostPage({ status: "planned", category: "feature" }, reader)).toMatchObject({
      total: 1,
    });
    // The author still sees their own posts, flagged hidden where moderated.
    const mine = await listPostPage({ sort: "new" }, author, true);
    expect(mine.total).toBe(4);
    expect(mine.items.filter((item) => item.hidden).map((item) => item.id)).toEqual(
      expect.arrayContaining([hidden, spam]),
    );
    expect(mine.items.find((item) => item.id === shown)?.hidden).toBeUndefined();
  });
  it("answer a direct link with not found, except to the author and admins", async () => {
    const author = await writer(),
      reader = await writer(),
      actor = await admin();
    const hidden = await post(author),
      spam = await post(author);
    await adminApi.setPostState(actor, { postId: hidden, state: "hidden" });
    await adminApi.setPostState(actor, { postId: spam, state: "spam" });
    for (const id of [hidden, spam]) {
      await expect(getPostDetail(id, null)).rejects.toMatchObject({ isNotFound: true });
      await expect(getPostDetail(id, reader)).rejects.toMatchObject({ isNotFound: true });
      await expect(getPostDetail(id, author)).resolves.toMatchObject({ id, hidden: true });
      await expect(getPostDetail(id, actor)).resolves.toMatchObject({ id, hidden: true });
      await expect(listCommentPage({ postId: id }, async () => reader)).rejects.toMatchObject({
        isNotFound: true,
      });
      await expect(listCommentPage({ postId: id })).rejects.toMatchObject({ isNotFound: true });
      await expect(listCommentPage({ postId: id }, async () => author)).resolves.toMatchObject({
        total: 0,
      });
    }
  });
  it("take no new votes or comments, and restoring a post restores everything", async () => {
    const author = await writer(),
      reader = await writer(),
      actor = await admin();
    const id = await post(author);
    await adminApi.setPostState(actor, { postId: id, state: "spam" });
    await expect(setVoteForUser({ postId: id, voted: true }, reader)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      addCommentForUser({ id: crypto.randomUUID(), postId: id, body: "hi" }, reader),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await row("SELECT hidden_at, spam FROM posts WHERE id = ?", id)).toMatchObject({
      spam: 1,
    });
    expect(
      (await row<{ hidden_at: number }>("SELECT hidden_at FROM posts WHERE id = ?", id))!.hidden_at,
    ).toBeGreaterThan(0);

    await adminApi.setPostState(actor, { postId: id, state: "visible" });
    expect(ids(await listPostPage({}, null))).toEqual([id]);
    await expect(setVoteForUser({ postId: id, voted: true }, reader)).resolves.toMatchObject({
      votes: 1,
    });
  });
  it("send visitors of a merged duplicate to its target", async () => {
    const author = await writer(),
      actor = await admin();
    const target = await post(author),
      dupe = await post(author);
    await adminApi.mergePost(actor, { sourceId: dupe, targetId: target });
    expect(await getPostDetail(dupe, null)).toMatchObject({ id: dupe, mergedInto: target });
    expect(await getPostDetail(target, null)).not.toHaveProperty("mergedInto");
    await expect(setVoteForUser({ postId: dupe, voted: true }, author)).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("offer only the categories the admin left on, for new posts", async () => {
    const author = await writer(),
      actor = await admin();
    await adminApi.saveSettings(actor, { categories: ["bug"] });
    await expect(createPostForUser(form(), author)).rejects.toMatchObject({
      code: "invalid_input",
      field: "category",
    });
    const bug = form();
    bug.set("category", "bug");
    await expect(createPostForUser(bug, author)).resolves.toMatchObject({ status: 201 });
  });
});

describe("merging duplicates", () => {
  it("moves votes to the target and counts a person who voted for both once", async () => {
    const [a, b, c, owner] = [await writer(), await writer(), await writer(), await writer()];
    const actor = await admin();
    const source = await post(owner),
      target = await post(owner);
    for (const voter of [a, b]) await setVoteForUser({ postId: source, voted: true }, voter);
    for (const voter of [b, c]) await setVoteForUser({ postId: target, voted: true }, voter);
    const before = (await row<{ revision: number }>(
      "SELECT revision FROM posts WHERE id = ?",
      target,
    ))!;

    await expect(
      adminApi.mergePost(actor, { sourceId: source, targetId: target }),
    ).resolves.toEqual({ targetId: target });
    const votes = await env.DB.prepare("SELECT user_id FROM votes WHERE post_id = ?")
      .bind(target)
      .all<{ user_id: string }>();
    expect(votes.results.map((vote) => vote.user_id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(await count("votes", `post_id = '${source}'`)).toBe(0);
    expect(await row("SELECT merged_into FROM posts WHERE id = ?", source)).toEqual({
      merged_into: target,
    });
    // Both posts are queued for re-mirroring to Notion with the new counts.
    expect(
      (await row<{ revision: number }>("SELECT revision FROM posts WHERE id = ?", target))!
        .revision,
    ).toBe(before.revision + 1);
    expect((await listPostPage({}, a)).items[0]).toMatchObject({ id: target, votes: 3 });
  });
  it("repoints earlier duplicates when their target is merged again, and refuses bad targets", async () => {
    const owner = await writer(),
      actor = await admin();
    const [first, second, third, hidden] = [
      await post(owner),
      await post(owner),
      await post(owner),
      await post(owner),
    ];
    await adminApi.mergePost(actor, { sourceId: first, targetId: second });
    await adminApi.mergePost(actor, { sourceId: second, targetId: third });
    expect(
      (
        await env.DB.prepare(
          "SELECT id, merged_into FROM posts WHERE merged_into IS NOT NULL",
        ).all()
      ).results,
    ).toEqual(
      expect.arrayContaining([
        { id: first, merged_into: third },
        { id: second, merged_into: third },
      ]),
    );
    await adminApi.setPostState(actor, { postId: hidden, state: "hidden" });
    const conflict = { code: "conflict" };
    await expect(
      adminApi.mergePost(actor, { sourceId: third, targetId: hidden }),
    ).rejects.toMatchObject(conflict);
    await expect(
      adminApi.mergePost(actor, { sourceId: third, targetId: first }),
    ).rejects.toMatchObject(conflict);
    await expect(
      adminApi.mergePost(actor, { sourceId: first, targetId: third }),
    ).rejects.toMatchObject(conflict);
    await expect(
      adminApi.mergePost(actor, { sourceId: third, targetId: third }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      adminApi.mergePost(actor, { sourceId: third, targetId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("finds visible posts to merge into, never the post itself", async () => {
    const owner = await writer(),
      actor = await admin();
    const source = await post(owner, { title: "Dark mode please" }),
      other = await post(owner, { title: "Dark theme" }),
      hidden = await post(owner, { title: "Dark hidden" });
    await adminApi.setPostState(actor, { postId: hidden, state: "hidden" });
    const found = await adminApi.searchMergeTargets(actor, { excludeId: source, q: "dark" });
    expect(found.map((item) => item.id)).toEqual([other]);
    expect((await adminApi.searchMergeTargets(actor, { excludeId: source, q: "" })).length).toBe(1);
  });
});

describe("deleting", () => {
  it("removes the post with its comments, votes and images, deletes the R2 objects and queues the Notion archive", async () => {
    const author = await writer(),
      voter = await writer(),
      actor = await admin();
    const id = await post(author, { images: 2 });
    const keys = (
      await env.DB.prepare("SELECT object_key FROM images WHERE post_id = ?")
        .bind(id)
        .all<{ object_key: string }>()
    ).results.map((image) => image.object_key);
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(await env.IMAGES.head(key)).not.toBeNull();
    await setVoteForUser({ postId: id, voted: true }, voter);
    await addCommentForUser({ id: crypto.randomUUID(), postId: id, body: "hello" }, voter);
    await env.DB.prepare("UPDATE posts SET notion_page_id = ? WHERE id = ?")
      .bind("22222222-2222-4222-8222-222222222222", id)
      .run();
    const keep = await post(author);
    await setVoteForUser({ postId: keep, voted: true }, voter);
    queue.reset();

    await expect(adminApi.deletePost(actor, { postId: id })).resolves.toEqual({ notion: "queued" });
    expect(await count("posts", `id = '${id}'`)).toBe(0);
    expect(await count("comments")).toBe(0);
    expect(await count("votes", `post_id = '${id}'`)).toBe(0);
    expect(await count("images")).toBe(0);
    for (const key of keys) expect(await env.IMAGES.head(key)).toBeNull();
    expect(queue.sent).toEqual([
      { type: "notion.archive", pageId: "22222222-2222-4222-8222-222222222222" },
    ]);
    // Only that post went: the other one and its vote are untouched.
    expect(await count("posts")).toBe(1);
    expect(await count("votes")).toBe(1);
    await expect(adminApi.deletePost(actor, { postId: id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("queues nothing for a post that never reached Notion, and reports a queue that is down", async () => {
    const author = await writer(),
      actor = await admin();
    const plain = await post(author),
      mirrored = await post(author);
    await env.DB.prepare("UPDATE posts SET notion_page_id = ? WHERE id = ?")
      .bind("33333333-3333-4333-8333-333333333333", mirrored)
      .run();
    queue.reset();
    await expect(adminApi.deletePost(actor, { postId: plain })).resolves.toEqual({
      notion: "none",
    });
    expect(queue.sent).toEqual([]);
    queue.failNext(2);
    await expect(adminApi.deletePost(actor, { postId: mirrored })).resolves.toEqual({
      notion: "failed",
    });
    expect(await count("posts")).toBe(0); // the delete itself still happened
  });
  it("hides duplicates that were merged into a deleted post instead of resurfacing them", async () => {
    const author = await writer(),
      actor = await admin();
    const target = await post(author),
      dupe = await post(author);
    await adminApi.mergePost(actor, { sourceId: dupe, targetId: target });
    await adminApi.deletePost(actor, { postId: target });
    expect(await row("SELECT merged_into FROM posts WHERE id = ?", dupe)).toEqual({
      merged_into: null,
    });
    expect(await listPostPage({}, null)).toMatchObject({ total: 0 });
  });
  it("archives the Notion row from the queue, treating a missing or already trashed row as done", async () => {
    const page = "44444444-4444-4444-8444-444444444444";
    const run = async (...replies: Parameters<typeof fakeFetch>) => {
      const fake = fakeFetch(...replies);
      vi.stubGlobal("fetch", fake.fetch);
      const ack = vi.fn(),
        retry = vi.fn();
      await consumeQueue({
        queue: "test",
        messages: [
          {
            id: "m",
            timestamp: new Date(),
            body: { type: "notion.archive", pageId: page },
            attempts: 1,
            ack,
            retry,
          },
        ],
        metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      });
      return { fake, ack, retry };
    };
    const ok = await run({ id: page });
    expect(ok.fake.requests).toHaveLength(1);
    expect(ok.fake.requests[0]).toMatchObject({
      method: "PATCH",
      url: `https://api.notion.com/v1/pages/${page}`,
      body: { in_trash: true },
    });
    expect(ok.ack).toHaveBeenCalledOnce();
    const gone = await run(
      new Response(JSON.stringify({ code: "object_not_found" }), { status: 404 }),
      new Response(JSON.stringify({ code: "object_not_found" }), { status: 404 }),
    );
    expect(gone.ack).toHaveBeenCalledOnce();
    const trashed = await run(
      new Response(JSON.stringify({ code: "validation_error" }), { status: 400 }),
      { id: page, in_trash: true, properties: {} },
    );
    expect(trashed.ack).toHaveBeenCalledOnce();
    expect(trashed.retry).not.toHaveBeenCalled();
  });
  it("deletes a comment and refreshes the post's mirrored count", async () => {
    const author = await writer(),
      actor = await admin();
    const id = await post(author);
    const comment = crypto.randomUUID();
    await addCommentForUser({ id: comment, postId: id, body: "spammy" }, author);
    const before = (await row<{ revision: number }>(
      "SELECT revision FROM posts WHERE id = ?",
      id,
    ))!;
    expect((await adminApi.listModerationComments(actor, {})).items).toMatchObject([
      { id: comment, postTitle: "Useful feature" },
    ]);
    await expect(adminApi.deleteComment(actor, { commentId: comment })).resolves.toEqual({
      postId: id,
    });
    expect(await count("comments")).toBe(0);
    expect(
      (await row<{ revision: number }>("SELECT revision FROM posts WHERE id = ?", id))!.revision,
    ).toBe(before.revision + 1);
    await expect(adminApi.deleteComment(actor, { commentId: comment })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("the moderation list", () => {
  it("is newest first, paginated, and filters hidden and spam", async () => {
    const author = await writer(),
      actor = await admin();
    const created: string[] = [];
    for (let i = 0; i < 23; i++) {
      const id = await post(author, { title: `Post ${i}` });
      created.push(id);
      await env.DB.prepare("UPDATE posts SET created_at = ? WHERE id = ?")
        .bind(1_000 + i, id)
        .run();
    }
    await adminApi.setPostState(actor, { postId: created[3], state: "hidden" });
    await adminApi.setPostState(actor, { postId: created[5], state: "spam" });
    const first = await adminApi.listModerationPosts(actor, {});
    expect(first).toMatchObject({
      total: 23,
      page: 1,
      limit: 20,
      hasMore: true,
      githubEnabled: false,
    });
    expect(first.items[0].id).toBe(created[22]);
    expect(first.items.find((item) => item.id === created[3])?.state).toBe("hidden");
    expect(ids(await adminApi.listModerationPosts(actor, { page: 2 }))).toEqual(
      created.slice(0, 3).reverse(),
    );
    expect(ids(await adminApi.listModerationPosts(actor, { filter: "hidden" }))).toEqual([
      created[3],
    ]);
    expect(ids(await adminApi.listModerationPosts(actor, { filter: "spam" }))).toEqual([
      created[5],
    ]);
    await expect(adminApi.listModerationPosts(actor, { filter: "nope" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
  it("offers Send to GitHub only when GitHub is configured, through the Notion checkbox's path", async () => {
    const author = await writer(),
      actor = await admin();
    const id = await post(author);
    await expect(adminApi.sendToGitHub(actor, { postId: id })).rejects.toMatchObject({
      code: "conflict",
    });
    config.integrations.github = { repo: "acme/app" };
    expect((await adminApi.listModerationPosts(actor, {})).githubEnabled).toBe(true);
    queue.reset();
    await expect(adminApi.sendToGitHub(actor, { postId: id })).resolves.toEqual({ queued: true });
    expect(await row("SELECT github_requested FROM posts WHERE id = ?", id)).toEqual({
      github_requested: 1,
    });
    expect(queue.sent).toEqual([{ type: "github.issue", postId: id }]);
    // Once an issue exists, a second send is refused: a post never gets two.
    await env.DB.prepare("UPDATE posts SET github_number = 7 WHERE id = ?").bind(id).run();
    await expect(adminApi.sendToGitHub(actor, { postId: id })).rejects.toMatchObject({
      code: "conflict",
    });
    const spam = await post(author);
    await adminApi.setPostState(actor, { postId: spam, state: "spam" });
    await expect(adminApi.sendToGitHub(actor, { postId: spam })).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

it.each(["hidden", "spam", "merged", "deleted"] as const)(
  "refuses admin GitHub sends for %s posts",
  async (state) => {
    config.integrations.github = { repo: "acme/app" };
    const actor = await admin(),
      author = await writer();
    const id = await post(author);
    if (state === "deleted") await adminApi.deletePost(actor, { postId: id });
    else if (state === "merged")
      await adminApi.mergePost(actor, { sourceId: id, targetId: await post(author) });
    else await adminApi.setPostState(actor, { postId: id, state });
    queue.reset();
    await expect(adminApi.sendToGitHub(actor, { postId: id })).rejects.toMatchObject({
      code: state === "deleted" ? "not_found" : "conflict",
    });
    expect(queue.sent).toEqual([]);
  },
);

describe("user management", () => {
  it("bans and unbans, and a banned user keeps reading but cannot write", async () => {
    const actor = await admin(),
      target = await writer(),
      id = await post(target);
    await adminApi.setBanned(actor, { userId: target.id, banned: true });
    expect(
      (await row<{ banned_at: number }>("SELECT banned_at FROM user WHERE id = ?", target.id))!
        .banned_at,
    ).toBeGreaterThan(0);
    await expect(
      setVoteForUser({ postId: id, voted: true }, { ...target, banned: true }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect((await adminApi.listUsers(actor, { filter: "banned" })).items.map((u) => u.id)).toEqual([
      target.id,
    ]);
    await adminApi.setBanned(actor, { userId: target.id, banned: false });
    expect(await row("SELECT banned_at FROM user WHERE id = ?", target.id)).toEqual({
      banned_at: null,
    });
  });
  it("cannot ban yourself, another admin or the built-in admin", async () => {
    const actor = await admin(),
      other = await admin();
    const builtIn = await ensureSyntheticAdmin();
    const forbidden = { code: "forbidden" };
    await expect(
      adminApi.setBanned(actor, { userId: actor.id, banned: true }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      adminApi.setBanned(actor, { userId: other.id, banned: true }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      adminApi.setBanned(actor, { userId: builtIn.id, banned: true }),
    ).rejects.toMatchObject(forbidden);
    expect(await count("user", "banned_at IS NOT NULL")).toBe(0);
    // The built-in admin is listed, marked, and can be told apart from real accounts.
    const listed = (await adminApi.listUsers(actor, {})).items;
    expect(listed.find((u) => u.id === SYNTHETIC_ADMIN_ID)).toMatchObject({
      builtIn: true,
      admin: true,
      email: null,
    });
    expect(listed.find((u) => u.id === actor.id)).toMatchObject({ self: true });
  });
  it("grants and revokes admin, but never lets you revoke yourself", async () => {
    const actor = await admin(),
      target = await writer();
    await adminApi.setAdminRole(actor, { userId: target.id, admin: true });
    expect(await row("SELECT role FROM user WHERE id = ?", target.id)).toEqual({ role: "admin" });
    await expect(
      adminApi.setAdminRole(actor, { userId: actor.id, admin: false }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await row("SELECT role FROM user WHERE id = ?", actor.id)).toEqual({ role: "admin" });
    await adminApi.setAdminRole(actor, { userId: target.id, admin: false });
    expect(await row("SELECT role FROM user WHERE id = ?", target.id)).toEqual({ role: "user" });
    await expect(
      adminApi.setAdminRole(actor, { userId: crypto.randomUUID(), admin: true }),
    ).rejects.toMatchObject({ code: "not_found" });
    await env.DB.prepare("UPDATE user SET is_anonymous = 1 WHERE id = ?").bind(target.id).run();
    await expect(
      adminApi.setAdminRole(actor, { userId: target.id, admin: true }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });
  it("searches by name or email and escapes wildcards", async () => {
    const actor = await admin();
    const ada = await writer();
    await env.DB.prepare(
      "UPDATE user SET name = 'Ada Lovelace', email = 'ada@example.com' WHERE id = ?",
    )
      .bind(ada.id)
      .run();
    expect((await adminApi.listUsers(actor, { q: "lovelace" })).items.map((u) => u.id)).toEqual([
      ada.id,
    ]);
    expect((await adminApi.listUsers(actor, { q: "ada@exam" })).items).toHaveLength(1);
    expect((await adminApi.listUsers(actor, { q: "%" })).items).toHaveLength(0);
    expect((await adminApi.listUsers(actor, { filter: "admin" })).items.map((u) => u.id)).toEqual([
      actor.id,
    ]);
  });
  it("lists voters on a post with email masking for guests/host users and pagination", async () => {
    const actor = await admin(),
      author = await writer(),
      postId = await post(author);
    const named = await writer();
    const guest = await writer();
    await env.DB.prepare(
      "UPDATE user SET name = 'Ada Voter', email = 'ada@example.com' WHERE id = ?",
    )
      .bind(named.id)
      .run();
    await env.DB.prepare(
      "UPDATE user SET name = 'Guest', email = 'anon-1@users.feedbax.invalid', is_anonymous = 1 WHERE id = ?",
    )
      .bind(guest.id)
      .run();
    await setVoteForUser({ postId, voted: true }, named);
    await env.DB.prepare("UPDATE votes SET created_at = 1000 WHERE post_id = ? AND user_id = ?")
      .bind(postId, named.id)
      .run();
    await setVoteForUser({ postId, voted: true }, guest);
    await env.DB.prepare("UPDATE votes SET created_at = 2000 WHERE post_id = ? AND user_id = ?")
      .bind(postId, guest.id)
      .run();

    const extra = Array.from({ length: 19 }, (_, i) => {
      const id = `extra-voter-${i + 1}`;
      return [
        env.DB.prepare(
          "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 1)",
        ).bind(id, `Voter ${i + 1}`, `voter${i + 1}@example.com`),
        env.DB.prepare("INSERT INTO votes (post_id, user_id, created_at) VALUES (?, ?, ?)").bind(
          postId,
          id,
          1500 + i,
        ),
      ];
    }).flat();
    await env.DB.batch(extra);

    const first = await adminApi.listPostVoters(actor, { postId, page: 1 });
    expect(first).toMatchObject({ total: 21, hasMore: true, page: 1, limit: 20 });
    expect(first.items[0]).toEqual({
      id: guest.id,
      name: "Anonymous",
      email: null,
      anonymous: true,
      createdAt: new Date(2000).toISOString(),
    });
    const second = await adminApi.listPostVoters(actor, { postId, page: 2 });
    expect(second).toMatchObject({ total: 21, hasMore: false, page: 2, limit: 20 });
    expect(second.items).toEqual([
      {
        id: named.id,
        name: "Ada Voter",
        email: "ada@example.com",
        anonymous: false,
        createdAt: new Date(1000).toISOString(),
      },
    ]);
    await expect(
      adminApi.listPostVoters(actor, { postId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
