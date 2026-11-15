import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv, flushWaitUntil, queue } from "../fixtures/cloudflare-workers.ts";
import { checkModeration, type ModerationProvider } from "../../src/moderation/index.ts";
import { wordListProvider, createWordListProvider } from "../../src/moderation/word-list.ts";
import { createPostForUser, getPostDetail, listPostPage } from "../../src/server/posts.ts";
import { addCommentForUser, listCommentPage } from "../../src/server/comments.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { readSettings, saveSettings } from "../../src/server/settings.ts";
import { form, writer } from "./helpers.ts";
import { disableEmail, enableEmail, consume, stubResend } from "../email/helpers.ts";
import { richText } from "../../src/email/content.ts";
import { readPost } from "../../src/sync/shared.ts";

beforeEach(resetEnv);
afterEach(async () => {
  disableEmail();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await resetEnv();
});
const policy = { mode: "flag" as const, blockedWords: [], allowedWords: [] };
const local = createWordListProvider();

describe("local word list", () => {
  it.each([
    "fuck",
    "FUCK",
    "f.u.c.k",
    "f u c k",
    "f*uck",
    "sh1t",
    "sh!t",
    "$hit",
    "fuuuck",
    "fu\u200bck",
    "ＦＵＣＫ",
    "This is fucking broken",
    "shit!",
  ])("flags %s", (text) => {
    expect(local.check(text)).toEqual({ verdict: "flag", reasons: ["profanity"] });
  });
  it.each([
    "Scunthorpe",
    "assessment",
    "classic",
    "classical",
    "assistant",
    "as",
    "A useful feature",
    "Let's hit the deadline",
    "it's hit or miss",
    "The pen is mightier",
    "We need 5 hits a day",
    "This damn button",
    "Kung fu panda",
    "5k users, plan B",
    "Breast cancer screening",
    "A jig for the pudding",
    "Identity: gay, lesbian, transgender; medical: breast cancer",
    `100%_test\\\n${"😀 ".repeat(20)}`,
  ])("allows %s", (text) => {
    expect(local.check(text)).toEqual({ verdict: "allow", reasons: [] });
  });
  it("matches custom literals and phrases; allows only the matching word", () => {
    const custom = createWordListProvider(["Acme", "bad phrase", "[a-z]+"], ["fuck", "acme"]);
    expect(custom.check("F.U.C.K ACME")).toMatchObject({ verdict: "allow" });
    expect(custom.check("FUCK shit")).toMatchObject({ verdict: "flag" });
    expect(custom.check("a bad phrase here")).toMatchObject({ verdict: "flag" });
    expect(custom.check("bad phrased")).toMatchObject({ verdict: "allow" });
    expect(custom.check("bad, phrase")).toMatchObject({ verdict: "flag" });
    expect(custom.check("bad phrase-y")).toMatchObject({ verdict: "flag" });
    expect(custom.check("anything")).toMatchObject({ verdict: "allow" });
  });
});

it("maps recommendations to flag/block policy and skips off/admin checks", async () => {
  const check = vi.fn(() => ({ verdict: "block" as const, reasons: ["profanity"] }));
  expect(await checkModeration("text", policy, false, { check })).toMatchObject({
    verdict: "flag",
  });
  expect(
    await checkModeration("text", { ...policy, mode: "block" }, false, { check }),
  ).toMatchObject({ verdict: "block" });
  check.mockClear();
  expect(await checkModeration("text", { ...policy, mode: "off" }, false, { check })).toMatchObject(
    { verdict: "allow" },
  );
  expect(await checkModeration("text", policy, true, { check })).toMatchObject({
    verdict: "allow",
  });
  expect(check).not.toHaveBeenCalled();
});
it("allows provider throws, rejected promises, invalid responses and timeouts with a content-free log", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const providers: ModerationProvider[] = [
    {
      check() {
        throw new Error("secret submitted text");
      },
    },
    { check: () => Promise.reject(new Error("secret token")) },
    { check: () => ({ verdict: "invalid", reasons: [] }) as never },
    { check: () => ({ verdict: "flag", reasons: [123] }) as never },
    { check: () => new Promise(() => {}) },
  ];
  for (const provider of providers)
    expect(await checkModeration("private text", policy, false, provider, 1)).toEqual({
      verdict: "allow",
      reasons: [],
    });
  expect(warn.mock.calls).toEqual(
    Array.from({ length: 5 }, () => [{ type: "moderation.failure", action: "allow" }]),
  );
});

it("holds post titles and bodies by default, hides them publicly, and clears the reason on approval", async () => {
  const who = await writer();
  for (const field of ["title", "body"]) {
    const data = form();
    data.set(field, "This is shit");
    queue.reset();
    const created = await createPostForUser(data, who);
    expect(created).toMatchObject({ status: 201, data: { heldForReview: true } });
    await flushWaitUntil();
    // Held posts reach neither the Notion queue nor webhooks.
    expect(queue.sent).toEqual([]);
    const id = created.data.postId;
    const admin = { ...who, admin: true as const };
    expect((await adminApi.listModerationPosts(admin, { filter: "hidden" })).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, moderationReason: "profanity", state: "hidden" }),
      ]),
    );
    expect((await listPostPage({}, null)).items).toHaveLength(0);
    await expect(getPostDetail(id, null)).rejects.toBeDefined();
    expect(await createPostForUser(data, who)).toMatchObject({ status: 200 });
    await adminApi.setPostState(admin, { postId: id, state: "visible" });
    expect(
      (await adminApi.listModerationPosts(admin, {})).items.find((p) => p.id === id),
    ).toMatchObject({ moderationReason: null, state: "visible" });
    await adminApi.setPostState(admin, { postId: id, state: "hidden" });
  }
});
it("switches modes, persists custom words, validates and resets settings; admins bypass", async () => {
  const who = await writer(),
    admin = { ...who, admin: true as const };
  expect((await readSettings()).moderation).toEqual(policy);
  await adminApi.saveSettings(admin, {
    moderation: { mode: "block", blockedWords: ["Acme"], allowedWords: ["shit"] },
  });
  const data = form();
  data.set("title", "Acme support");
  await expect(createPostForUser(data, who)).rejects.toMatchObject({
    code: "invalid_input",
    message: expect.stringContaining("rephrase"),
  });
  expect(await env.DB.prepare("SELECT count(*) AS n FROM posts").first("n")).toBe(0);
  await createPostForUser(data, admin);
  const allowed = form();
  allowed.set("body", "shit");
  await createPostForUser(allowed, who);
  await saveSettings({ moderation: { mode: "off" } });
  const off = form();
  off.set("body", "fuck");
  await createPostForUser(off, who);
  expect((await listPostPage({}, null)).total).toBe(3);
  for (const moderation of [
    { mode: "bad" },
    { blockedWords: [""] },
    { allowedWords: ["x".repeat(65)] },
    { blockedWords: Array(101).fill("word") },
    { blockedWords: ["***"] },
  ])
    await expect(adminApi.saveSettings(admin, { moderation })).rejects.toMatchObject({
      code: "invalid_input",
    });
  await expect(adminApi.saveSettings(who, { moderation: { mode: "off" } })).rejects.toMatchObject({
    code: "forbidden",
  });
  await saveSettings({ moderation: { mode: null, blockedWords: null, allowedWords: null } });
  expect((await readSettings()).moderation).toEqual(policy);
});
it("holds comments, suppresses public counts/events, preserves replay, and permits admin approval", async () => {
  const who = await writer(),
    other = await writer(),
    admin = { ...who, admin: true as const };
  const postId = (await createPostForUser(form(), who)).data.postId;
  enableEmail();
  await flushWaitUntil();
  queue.reset();
  const input = { id: crypto.randomUUID(), postId, body: "sh1t" };
  const revision = await env.DB.prepare("SELECT revision FROM posts WHERE id = ?")
    .bind(postId)
    .first("revision");
  const created = await addCommentForUser(input, other);
  expect(created).toMatchObject({ body: "sh1t", heldForReview: true });
  expect(await addCommentForUser(input, other)).toEqual(created);
  expect(await listCommentPage({ postId })).toMatchObject({ total: 0, items: [] });
  expect(await getPostDetail(postId, null)).toMatchObject({ comments: 0 });
  expect(await readPost(postId)).toMatchObject({ comments: 0, revision });
  await flushWaitUntil();
  expect(queue.sent).toEqual([]);
  // Even a stale or forged queued event must not email held content.
  const sent = stubResend();
  await consume({
    type: "email.reply",
    id: crypto.randomUUID(),
    post: { id: postId, title: "Useful feature" },
    comment: {
      id: input.id,
      authorId: other.id,
      authorName: other.name,
      body: richText(input.body),
    },
  });
  expect(sent.calls).toEqual([]);
  expect((await adminApi.listModerationComments(admin, {})).items).toEqual([
    expect.objectContaining({ id: input.id, hidden: true, moderationReason: "profanity" }),
  ]);
  await expect(adminApi.approveComment(other, { commentId: input.id })).rejects.toMatchObject({
    code: "forbidden",
  });
  await adminApi.approveComment(admin, { commentId: input.id });
  expect(queue.sent).toEqual([{ type: "notion.post", postId }]);
  await adminApi.approveComment(admin, { commentId: input.id });
  expect(queue.sent).toHaveLength(1);
  expect(await readPost(postId)).toMatchObject({ comments: 1, revision: Number(revision) + 1 });
  expect(await listCommentPage({ postId })).toMatchObject({ total: 1 });
  expect(await getPostDetail(postId, null)).toMatchObject({ comments: 1 });
  expect((await adminApi.listModerationComments(admin, {})).items[0]).toMatchObject({
    hidden: false,
    moderationReason: null,
  });
  await saveSettings({ moderation: { mode: "block" } });
  await expect(
    addCommentForUser({ ...input, id: crypto.randomUUID() }, other),
  ).rejects.toMatchObject({ code: "invalid_input" });
  await addCommentForUser({ ...input, id: crypto.randomUUID() }, admin);
  await saveSettings({ moderation: { mode: "off" } });
  await addCommentForUser({ ...input, id: crypto.randomUUID() }, other);
  expect((await listCommentPage({ postId })).total).toBe(3);
});

it("keeps post and comment creation available when the provider throws", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(wordListProvider([], []), "check").mockImplementation(() => {
    throw new Error("fake provider outage");
  });
  await saveSettings({ moderation: { mode: "block" } });
  const who = await writer(),
    data = form();
  data.set("title", "shit");
  const postId = (await createPostForUser(data, who)).data.postId;
  await addCommentForUser({ id: crypto.randomUUID(), postId, body: "shit" }, who);
  expect((await listPostPage({}, null)).total).toBe(1);
  expect((await listCommentPage({ postId })).total).toBe(1);
});
