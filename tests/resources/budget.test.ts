// Resource budgets for Workers Free (see .scratch/rebuild-0.3.0/resources.md): what an idle
// cron tick, a backfill tick and the failure paths may cost in D1 statements, Queue calls and
// external fetches, plus the query plans the hot paths depend on.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import { consumeQueue, runScheduled } from "../../src/sync/index.ts";
import { readState, writeState } from "../../src/sync/shared.ts";
import type { SyncErrorState, SyncMessage } from "../../src/contracts/sync.ts";
import { NOTION_SCHEMA } from "../../src/integrations/notion-schema.ts";
import { handleHealth } from "../../src/server/http.ts";
import { serveImage } from "../../src/server/images.ts";
import { getInsights } from "../../src/server/insights.ts";
import { clearInsightsCache } from "../../src/server/insights-cache.ts";
import { createPostForUser, getPostDetail } from "../../src/server/posts.ts";
import { queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import { form, png, writer } from "../api/helpers.ts";
import { measure } from "./meter.ts";

const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const tick = (scheduledTime = NOW) =>
  ({ scheduledTime, cron: "*/5 * * * *", noRetry() {} }) satisfies ScheduledController;
const postId = (i: number) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`;

/** `count` posts, all mirrored to Notion; the first `linkedOpen` link an open GitHub issue. */
async function seed(count: number, patch: { linkedOpen?: number; synced?: boolean } = {}) {
  const sql = [
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('author', 'A', 'a@example.invalid', 0, 0, 0)`,
  ];
  for (let i = 0; i < count; i++) {
    const synced = patch.synced ?? true,
      linked = i < (patch.linkedOpen ?? 0);
    sql.push(
      `INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at, notion_page_id, notion_revision, github_requested, github_number) VALUES ('${postId(i)}', 'author', 'T', 'B', 'bug', ${i}, ${i}, ${synced ? `'${postId(i).replace("aaaaaaaa", "bbbbbbbb")}'` : "NULL"}, ${synced ? 1 : 0}, ${linked ? 1 : 0}, ${linked ? i + 1 : "NULL"})`,
    );
  }
  for (let i = 0; i < sql.length; i += 500)
    await env.DB.batch(sql.slice(i, i + 500).map((statement) => env.DB.prepare(statement)));
}
const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString();
/** Notion and GitHub answer every call with an empty, successful result unless overridden. */
function providers(github: (init?: RequestInit) => Response = () => Response.json([])) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(urlOf(input));
    if (url.hostname === "api.github.com") return github(init);
    if (url.pathname.endsWith("/query"))
      return Response.json({ results: [], has_more: false, next_cursor: null });
    return Response.json({ properties: NOTION_SCHEMA });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function deliver(body: SyncMessage, attempts = 1) {
  const message = { id: "m", timestamp: new Date(), body, attempts, ack: vi.fn(), retry: vi.fn() };
  await consumeQueue({
    queue: "test",
    messages: [message],
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  });
  return message;
}
/** Deliver everything the cron queued, as the real queue would. */
async function drain() {
  const messages = queue.sent.splice(0);
  for (const body of messages) await deliver(body);
  return messages;
}
async function idle() {
  await writeState("notion.watermark", new Date(NOW - 300_000).toISOString());
  await writeState("github.watermark", new Date(NOW - 300_000).toISOString());
}

beforeEach(async () => {
  await resetEnv();
  config.integrations.github = { repo: "acme/app" };
  env.GITHUB_TOKEN = "github_test_only";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  config.integrations.github = false;
  delete env.GITHUB_TOKEN;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cron tick budget", () => {
  test("an idle tick with 1,000 posts is 5 D1 statements, one Queue call and two polls", async () => {
    await seed(1000, { linkedOpen: 3 });
    await idle();
    const fetch = providers();
    const cron = await measure(() => runScheduled(tick()));
    expect(cron).toMatchObject({ queries: 5, rowsWritten: 0, fetches: 0, queueCalls: 1 });
    expect(cron.rowsRead).toBeLessThanOrEqual(20);
    expect(queue.sent.map((message) => message.type)).toEqual(["notion.poll", "github.poll"]);
    const consumer = await measure(drain);
    // Notion: schema check + filtered query. GitHub: one `since` query. No re-sends.
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(consumer).toMatchObject({ queries: 4, queueCalls: 0 });
    expect(queue.sent).toEqual([]);
  });
  test("with no open linked issue GitHub is not called and its watermark still advances", async () => {
    await seed(300);
    await idle();
    const fetch = providers();
    await runScheduled(tick());
    expect(queue.sent.map((message) => message.type)).toEqual(["notion.poll"]);
    expect(await readState("github.watermark")).toBe(new Date(NOW).toISOString());
    await drain();
    expect(fetch.mock.calls.every(([url]) => urlOf(url).startsWith("https://api.notion"))).toBe(
      true,
    );
  });
  test("a backfill tick stays far below 50 subrequests: one Queue call for 37 messages", async () => {
    await seed(1000, { synced: false });
    await env.DB.prepare("UPDATE posts SET github_requested = 1").run();
    const cron = await measure(() => runScheduled(tick()));
    expect(cron.queueCalls).toBe(1);
    expect(cron.queueSends).toBe(25 + 10 + 2);
    expect(cron.queries).toBeLessThanOrEqual(6);
  });
});

describe("failures never loop", () => {
  test("a write-only 403 (read-only token) survives a successful poll and pauses the sweep", async () => {
    await seed(10);
    await env.DB.prepare("UPDATE posts SET github_requested = 1").run();
    const fetch = providers((init) =>
      init?.method === "POST" ? new Response("no", { status: 403 }) : Response.json([]),
    );
    const first = await deliver({ type: "github.issue", postId: postId(0) });
    expect(first.ack).toHaveBeenCalled();
    expect(first.retry).not.toHaveBeenCalled();
    await deliver({
      type: "github.poll",
      since: new Date(NOW - 420_000).toISOString(),
      until: new Date(NOW).toISOString(),
      page: 1,
    });
    expect(await readState<SyncErrorState>("github.error")).toMatchObject({
      status: 403,
      type: "github.issue",
    });
    expect(await (await handleHealth()).json()).toMatchObject({ github: "failing" });
    fetch.mockClear();
    // Every tick of the next hour: no github.issue re-send, only the probing poll.
    for (let minute = 5; minute < 60; minute += 5) {
      await runScheduled(tick(Date.now() + minute * 60_000));
      const sent = await drain();
      expect(sent.some((message) => message.type === "github.issue")).toBe(false);
    }
    const issueCreates = fetch.mock.calls.filter(
      ([url, init]) => urlOf(url).startsWith("https://api.github.com") && init?.method === "POST",
    );
    expect(issueCreates).toHaveLength(0);
  });
  test("a permanent 404 is acked once, recorded for /api/health and never retried", async () => {
    await seed(1);
    await env.DB.prepare("UPDATE posts SET revision = 2").run();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 404 })),
    );
    const message = await deliver({ type: "notion.post", postId: postId(0) }, 1);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(await (await handleHealth()).json()).toMatchObject({ notion: "failing" });
    await runScheduled(tick(Date.now()));
    expect(queue.sent.some((sent) => sent.type === "notion.post")).toBe(false);
  });
  test("a transient outage backs the provider off: the retry is the only probe", async () => {
    await seed(3, { synced: false });
    config.integrations.github = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const message = await deliver({ type: "notion.post", postId: postId(0) }, 5);
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 480 });
    expect(await readState("notion.error")).toMatchObject({ code: "transient" });
    // Inside the backoff window the cron sends Notion nothing; afterwards it resumes.
    await runScheduled(tick(Date.now() + 300_000));
    expect(queue.sent).toEqual([]);
    await runScheduled(tick(Date.now() + 481_000));
    expect(queue.sent.map((sent) => sent.type)).toContain("notion.poll");
    // Any successful call clears the backoff.
    queue.reset();
    providers();
    await deliver({
      type: "notion.poll",
      since: new Date(NOW - 420_000).toISOString(),
      until: new Date(NOW).toISOString(),
      cursor: null,
    });
    expect(await readState("notion.backoff")).toBeNull();
    expect(await readState("notion.error")).toBeNull();
    expect(await (await handleHealth()).json()).toMatchObject({ notion: "ok" });
  });
});

describe("hot query plans", () => {
  const plan = async (query: string, params: unknown[] = []) =>
    (
      await env.DB.prepare(`EXPLAIN QUERY PLAN ${query}`)
        .bind(...params)
        .all<{ detail: string }>()
    ).results
      .map((row) => row.detail)
      .join(" | ");
  test("cron sweeps read only their partial indexes", async () => {
    expect(
      await plan(
        "SELECT id FROM posts INDEXED BY posts_notion_pending WHERE notion_blocked = 0 AND (notion_page_id IS NULL OR notion_revision < revision) ORDER BY updated_at, id LIMIT 25",
      ),
    ).toContain("USING INDEX posts_notion_pending");
    expect(
      await plan(
        "SELECT id FROM posts INDEXED BY posts_github_pending WHERE github_requested = 1 AND github_number IS NULL LIMIT 10",
      ),
    ).toContain("USING INDEX posts_github_pending");
    expect(
      await plan(
        "SELECT id FROM posts INDEXED BY posts_github_open WHERE github_number IS NOT NULL AND github_closed_at IS NULL LIMIT 1",
      ),
    ).toContain("USING INDEX posts_github_open");
  });
  test("the trending sort counts recent votes from a covering index", async () => {
    expect(
      await plan(
        "SELECT id FROM posts ORDER BY (SELECT coalesce(sum(604800000 + created_at - 0), 0) FROM votes WHERE post_id = posts.id AND created_at >= 0) DESC LIMIT 20",
      ),
    ).toContain("COVERING INDEX votes_post_created_idx (post_id=? AND created_at>?)");
  });
  test("admin insights read a 7d or 30d window through the created_at indexes", async () => {
    for (const range of ["7d", "30d"] as const) {
      const captured: { query: string; params: unknown[] }[] = [];
      const spy = {
        prepare: (query: string) => ({
          bind: (...params: unknown[]) => {
            captured.push({ query, params });
            return env.DB.prepare(query).bind(...params);
          },
        }),
        batch: (all: D1PreparedStatement[]) => env.DB.batch(all),
      } as unknown as D1Database;
      await getInsights({ range }, NOW, spy);
      // 1 and 5 (all-time breakdowns, popular requests) scan by design and are cached.
      // 2 (activity), 3 (first response) and 4 (delivery) are bounded by the window.
      const [activity, response, delivery] = await Promise.all(
        [1, 2, 3].map(async (i) => plan(`${captured[i]!.query}`, captured[i]!.params)),
      );
      for (const detail of [activity, response, delivery]) {
        expect(detail).not.toMatch(/SCAN (posts|votes|comments)\b/);
      }
      expect(activity).toContain("SEARCH votes USING INDEX votes_created_post_idx (created_at>?)");
      expect(activity).toContain(
        "SEARCH comments USING INDEX comments_created_post_idx (created_at>?)",
      );
      expect(activity).toContain("SEARCH posts USING INDEX posts_created_idx (created_at>?)");
      expect(response).toContain("SEARCH posts USING INDEX posts_created_idx (created_at>?)");
      expect(response).toContain("SEARCH cp USING INDEX changelog_posts_post_idx (post_id=?)");
      expect(delivery).toContain("SEARCH posts USING INDEX posts_status_created_idx (status=?)");
      clearInsightsCache();
    }
  });
});

test("a revalidated image is answered from D1 without reading R2", async () => {
  const user = await writer(),
    data = form();
  data.append("image", png());
  await createPostForUser(data, user);
  const [image] = (await getPostDetail(data.get("id") as string, user)).images;
  const first = await serveImage(new Request(env.PORTAL_URL), image.id);
  expect(first.headers.get("etag")).toBe(`"${image.id}"`);
  await first.arrayBuffer();
  const get = vi.spyOn(env.IMAGES, "get");
  const again = await serveImage(
    new Request(env.PORTAL_URL, { headers: { "if-none-match": first.headers.get("etag")! } }),
    image.id,
  );
  expect(again.status).toBe(304);
  expect(again.headers.get("cache-control")).toBe("public, max-age=60, must-revalidate");
  expect(get).not.toHaveBeenCalled();
});
