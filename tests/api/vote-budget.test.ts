import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv, queue, flushWaitUntil } from "../fixtures/cloudflare-workers.ts";
import { form, writer } from "./helpers.ts";
import { createPostForUser } from "../../src/server/posts.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import { runScheduled, consumeQueue } from "../../src/sync/index.ts";
beforeEach(resetEnv);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("atomically limits alternate vote transitions, coalesces sends, and cron repairs final revision", async () => {
  const user = await writer(),
    data = form(),
    postId = data.get("id") as string;
  await createPostForUser(data, user);
  await flushWaitUntil();
  queue.reset();
  let accepted = 0;
  for (let i = 0; i < 30; i++) {
    try {
      await setVoteForUser({ postId, voted: i % 2 === 0 }, user);
      accepted++;
    } catch (error) {
      expect(error).toMatchObject({ code: "rate_limited" });
      break;
    }
  }
  expect(accepted).toBe(10);
  await expect(setVoteForUser({ postId, voted: false }, user)).resolves.toEqual({
    votes: 0,
    viewerHasVoted: false,
  });
  await flushWaitUntil();
  expect(queue.sent.length).toBeLessThanOrEqual(1);
  queue.reset();
  await runScheduled({ scheduledTime: Date.now() + 300000, cron: "*/5 * * * *", noRetry() {} });
  expect(queue.sent).toContainEqual({ type: "notion.post", postId });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(url.endsWith("/query") ? { results: [], has_more: false } : { id: "mirror" }),
    ),
  );
  await consumeQueue({
    queue: "test",
    messages: [
      {
        id: "m",
        timestamp: new Date(),
        body: { type: "notion.post", postId },
        attempts: 1,
        ack: vi.fn(),
        retry: vi.fn(),
      },
    ],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<import("../../src/contracts/sync.ts").SyncMessage>);
  expect(
    await env.DB.prepare("SELECT revision, notion_revision FROM posts WHERE id = ?")
      .bind(postId)
      .first(),
  ).toEqual({ revision: 11, notion_revision: 11 });
});
it("concurrent distinct-post transitions share one per-user budget", async () => {
  const user = await writer();
  const ids = Array.from({ length: 15 }, () => crypto.randomUUID());
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare(
        "INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES (?, ?, 'T', 'B', 'bug', 1, 1)",
      ).bind(id, user.id),
    ),
  );
  const outcomes = await Promise.allSettled(
    ids.map((postId) => setVoteForUser({ postId, voted: true }, user)),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(10);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM votes").first()).toEqual({ n: 10 });
});
it("retains the hourly budget across fresh burst windows, with no-op requests still idempotent", async () => {
  const user = await writer(),
    data = form(),
    postId = data.get("id") as string;
  await createPostForUser(data, user);
  const original = Date.now(),
    clock = vi.spyOn(Date, "now");
  try {
    for (let window = 0; window < 12; window++) {
      clock.mockReturnValue(original + window * 10001);
      for (let transition = 0; transition < 10; transition++)
        await setVoteForUser({ postId, voted: transition % 2 === 0 }, user);
    }
    clock.mockReturnValue(original + 120012);
    await expect(setVoteForUser({ postId, voted: true }, user)).rejects.toMatchObject({
      code: "rate_limited",
    });
    await expect(setVoteForUser({ postId, voted: false }, user)).resolves.toEqual({
      votes: 0,
      viewerHasVoted: false,
    });
  } finally {
    clock.mockRestore();
  }
});
