import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import { flushWaitUntil, queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import type { ViewerUser } from "../../src/contracts/domain.ts";
import type { SyncMessage } from "../../src/contracts/sync.ts";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_LIMITS,
  WEBHOOK_RETRY_SECONDS,
  type WebhookEnvelope,
} from "../../src/contracts/webhooks.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { addCommentForUser } from "../../src/server/comments.ts";
import { changelogPublishedSinks } from "../../src/server/changelog-events.ts";
import { createPostForUser } from "../../src/server/posts.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import {
  emitChangelogWebhook,
  emitPostCreated,
  emitStatusChanges,
  emitVoteCreated,
  emitWebhooks,
  signWebhook,
} from "../../src/server/webhooks.ts";
import { consumeQueue } from "../../src/sync/index.ts";
import { NOTION_SCHEMA } from "../../src/integrations/notion-schema.ts";
import { fakeFetch, ID, list, notionRow, SINCE, UNTIL } from "../sync/helpers.ts";
import { form, writer } from "./helpers.ts";

const URL_A = "https://hooks.example.com/feedbax";
const PORTAL = env.PORTAL_URL;

beforeEach(async () => {
  await resetEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  env.PORTAL_URL = PORTAL;
  config.integrations.github = false;
  changelogPublishedSinks.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const count = async (table: string, where = "1=1") =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<{
    n: number;
  }>())!.n;
const rows = <T>(sql: string, ...binds: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...binds)
    .all<T>()
    .then((result) => result.results);
async function admin(): Promise<ViewerUser & { admin: true }> {
  const user = await writer();
  await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(user.id).run();
  return { ...user, admin: true };
}
const add = async (
  who: ViewerUser & { admin: true },
  url = URL_A,
  events: readonly string[] = WEBHOOK_EVENTS,
) => adminApi.webhookCreate(who, { url, events });
async function post(author: ViewerUser, patch: { title?: string; body?: string } = {}) {
  const data = form();
  if (patch.title) data.set("title", patch.title);
  if (patch.body) data.set("body", patch.body);
  await createPostForUser(data, author);
  return data.get("id") as string;
}

type Sent = { url: string; init: RequestInit; headers: Headers; body: string };
/** Replaces fetch: each call takes the next reply (a Response, or an Error to throw). */
function stubFetch(...replies: (() => Response | Error)[]) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      sent.push({
        url: String(input),
        init,
        headers: new Headers(init.headers),
        body: init.body as string,
      });
      const reply = (replies.length > 1 ? replies.shift()! : replies[0]!)();
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  );
  return sent;
}
const respond =
  (status: number, headers: Record<string, string> = {}) =>
  () =>
    new Response(status === 204 ? null : "secret receiver body", { status, headers });
const fail = (error: Error) => () => error;

/** Runs the queued `webhook.deliver` messages once, as the queue consumer would. */
async function consume(attempts = 1) {
  const messages = queue.sent
    .splice(0)
    .filter((m) => (m as SyncMessage).type === "webhook.deliver");
  const results: { ack: ReturnType<typeof vi.fn>; retry: ReturnType<typeof vi.fn> }[] = [];
  for (const body of messages) {
    const ack = vi.fn();
    const retry = vi.fn();
    await consumeQueue({
      queue: "test",
      messages: [
        { id: "m", timestamp: new Date(), body: body as SyncMessage, attempts, ack, retry },
      ],
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    });
    results.push({ ack, retry });
  }
  return results;
}
const deliveries = () =>
  rows<{
    id: string;
    event: string;
    status: string;
    attempts: number;
    response_status: number | null;
    last_error: string | null;
    payload: string;
    endpoint_id: string;
  }>("SELECT * FROM webhook_deliveries ORDER BY created_at, id");
const webhookMessages = () =>
  queue.sent.filter((m) => (m as SyncMessage).type === "webhook.deliver");
const envelopeOf = (sent: Sent) => JSON.parse(sent.body) as WebhookEnvelope;

describe("the admin guard on webhooks", () => {
  it("rejects every webhook function for non-admins, changing and revealing nothing", async () => {
    const who = await admin(),
      reader = await writer();
    const made = await add(who);
    for (const name of [
      "webhooksList",
      "webhookCreate",
      "webhookUpdate",
      "webhookDelete",
      "webhookRevealSecret",
      "webhookRotateSecret",
      "webhookTest",
    ] as const)
      for (const viewer of [null, reader])
        await expect(
          (adminApi[name] as (v: ViewerUser | null, i: unknown) => Promise<unknown>)(viewer, {
            id: made.endpoint.id,
            url: "https://evil.example.com/",
            events: ["vote.created"],
          }),
          `${name} as ${viewer?.name ?? "signed out"}`,
        ).rejects.toMatchObject({ code: expect.stringMatching(/^(unauthenticated|forbidden)$/) });
    expect(await count("webhook_endpoints")).toBe(1);
    expect(await count("webhook_deliveries")).toBe(0);
  });
});

describe("managing endpoints", () => {
  it("adds an endpoint, returns its secret once and never lists it", async () => {
    const who = await admin();
    const made = await add(who, URL_A, ["vote.created", "post.created", "vote.created"]);
    expect(made.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    // Events are stored once each, in the canonical order.
    expect(made.endpoint).toMatchObject({
      url: URL_A,
      events: ["post.created", "vote.created"],
      enabled: true,
      last: null,
    });
    const listed = await adminApi.webhooksList(who, undefined);
    expect(listed.endpoints).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(made.secret);
    expect(JSON.stringify(listed)).not.toContain("whsec_");
  });

  it("reveals the same secret and rotates to a new one", async () => {
    const who = await admin();
    const made = await add(who);
    expect(await adminApi.webhookRevealSecret(who, { id: made.endpoint.id })).toEqual({
      secret: made.secret,
    });
    const rotated = await adminApi.webhookRotateSecret(who, { id: made.endpoint.id });
    expect(rotated.secret).toMatch(/^whsec_/);
    expect(rotated.secret).not.toBe(made.secret);
    expect(await adminApi.webhookRevealSecret(who, { id: made.endpoint.id })).toEqual(rotated);
    await expect(
      adminApi.webhookRevealSecret(who, { id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("edits the URL and events, pauses and resumes, and deletes with its log", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    const edited = await adminApi.webhookUpdate(who, {
      id: endpoint.id,
      url: "https://other.example.com/in",
      events: ["comment.created"],
    });
    expect(edited).toMatchObject({
      url: "https://other.example.com/in",
      events: ["comment.created"],
    });
    expect((await adminApi.webhookUpdate(who, { id: endpoint.id, enabled: false })).enabled).toBe(
      false,
    );
    expect((await adminApi.webhookUpdate(who, { id: endpoint.id, enabled: true })).enabled).toBe(
      true,
    );
    await adminApi.webhookTest(who, { id: endpoint.id });
    expect(await count("webhook_deliveries")).toBe(1);
    await adminApi.webhookDelete(who, { id: endpoint.id });
    expect(await count("webhook_endpoints")).toBe(0);
    expect(await count("webhook_deliveries")).toBe(0);
    await expect(
      adminApi.webhookUpdate(who, { id: endpoint.id, enabled: true }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates input: events, URL, enabled flag and the endpoint limit", async () => {
    const who = await admin();
    for (const events of [[], ["nope"], "post.created", ["webhook.test"], undefined])
      await expect(adminApi.webhookCreate(who, { url: URL_A, events })).rejects.toMatchObject({
        code: "invalid_input",
      });
    await expect(
      adminApi.webhookCreate(who, { url: "", events: ["post.created"] }),
    ).rejects.toMatchObject({ code: "invalid_input", field: "url" });
    const { endpoint } = await add(who);
    for (const patch of [{}, { enabled: "yes" }, { url: 5 }, { events: [] }])
      await expect(
        adminApi.webhookUpdate(who, { id: endpoint.id, ...patch }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    for (let i = 1; i < WEBHOOK_LIMITS.endpoints; i++) await add(who, `https://h${i}.example.com/`);
    await expect(add(who, "https://one-more.example.com/")).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await count("webhook_endpoints")).toBe(WEBHOOK_LIMITS.endpoints);
  });

  it("requires https on public hosts in production and allows local http only in development", async () => {
    const who = await admin();
    // The test portal is http://localhost: development.
    expect((await adminApi.webhooksList(who, undefined)).lenient).toBe(true);
    await expect(add(who, "http://localhost:4000/hook")).resolves.toBeTruthy();
    env.PORTAL_URL = "https://portal.example.com";
    const strict = await adminApi.webhooksList(who, undefined);
    expect(strict.lenient).toBe(false);
    for (const url of [
      "http://hooks.example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://[::ffff:7f00:1]/x",
      "https://intranet/x",
    ])
      await expect(add(who, url), url).rejects.toMatchObject({
        code: "invalid_input",
        field: "url",
      });
    await expect(add(who, "https://public.example.com/ok")).resolves.toBeTruthy();
  });
});

describe("events", () => {
  it("do nothing, and cost no queue message, while no endpoint exists", async () => {
    const author = await writer();
    const id = await post(author);
    await addCommentForUser({ postId: id, body: "hi", id: crypto.randomUUID() }, author);
    await setVoteForUser({ postId: id, voted: true }, await writer());
    await flushWaitUntil();
    expect(await count("webhook_deliveries")).toBe(0);
    expect(webhookMessages()).toEqual([]);
  });

  it("post.created carries Markdown and plain text, the author name and no email", async () => {
    const who = await admin(),
      author = await writer();
    await add(who, URL_A, ["post.created"]);
    const id = await post(author, {
      title: "Dark mode",
      body: "Please add **dark** mode\n\n- now",
    });
    await flushWaitUntil();
    const [delivery] = await deliveries();
    expect(delivery).toMatchObject({ event: "post.created", status: "pending", attempts: 0 });
    expect(queue.sent).toContainEqual({ type: "webhook.deliver", deliveryId: delivery!.id });
    const envelope = JSON.parse(delivery!.payload) as WebhookEnvelope<"post.created">;
    expect(envelope).toMatchObject({
      type: "post.created",
      id: expect.any(String),
      createdAt: expect.any(String),
      data: {
        post: {
          id,
          title: "Dark mode",
          body: "Please add **dark** mode\n\n- now",
          bodyText: "Please add dark mode\n\n- now",
          category: "feature",
          status: "open",
          url: `${PORTAL}/posts/${id}`,
          votes: 0,
          author: { name: "Ada", anonymous: false },
        },
      },
    });
    expect(delivery!.payload).not.toContain("@example.com");
  });

  it("comment.created and vote.created fire once for real changes only", async () => {
    const who = await admin(),
      author = await writer(),
      voter = await writer();
    await add(who, URL_A, ["comment.created", "vote.created"]);
    const id = await post(author);
    await addCommentForUser(
      { postId: id, body: "Works for **me**", id: crypto.randomUUID() },
      voter,
    );
    await setVoteForUser({ postId: id, voted: true }, voter);
    await setVoteForUser({ postId: id, voted: true }, voter); // repeat: no event
    await setVoteForUser({ postId: id, voted: false }, voter); // removal: no event
    await flushWaitUntil();
    const all = await deliveries();
    expect(all.map((d) => d.event)).toEqual(["comment.created", "vote.created"]);
    const comment = JSON.parse(all[0]!.payload) as WebhookEnvelope<"comment.created">;
    expect(comment.data).toMatchObject({
      comment: { body: "Works for **me**", bodyText: "Works for me", author: { name: "Ada" } },
      post: { id, url: `${PORTAL}/posts/${id}` },
    });
    const vote = JSON.parse(all[1]!.payload) as WebhookEnvelope<"vote.created">;
    expect(vote.data.post).toMatchObject({ id, votes: 1 });
    // The voter is not part of the payload.
    expect(all[1]!.payload).not.toContain(voter.id);
  });

  it("only endpoints that subscribed to an event get it, and paused ones get nothing", async () => {
    const who = await admin(),
      author = await writer();
    const a = await add(who, "https://a.example.com/", ["post.created"]);
    await add(who, "https://b.example.com/", ["vote.created"]);
    const c = await add(who, "https://c.example.com/", ["post.created"]);
    await adminApi.webhookUpdate(who, { id: c.endpoint.id, enabled: false });
    await post(author);
    await flushWaitUntil();
    expect((await deliveries()).map((d) => d.endpoint_id)).toEqual([a.endpoint.id]);
  });

  it("are not sent for hidden, spam or merged posts", async () => {
    const who = await admin(),
      author = await writer();
    await add(who);
    const shown = await post(author),
      hidden = await post(author),
      spam = await post(author),
      dupe = await post(author);
    await flushWaitUntil();
    await env.DB.prepare("DELETE FROM webhook_deliveries").run();
    await adminApi.setPostState(who, { postId: hidden, state: "hidden" });
    await adminApi.setPostState(who, { postId: spam, state: "spam" });
    await adminApi.mergePost(who, { sourceId: dupe, targetId: shown });
    await env.DB.prepare("UPDATE posts SET status = 'planned'").run();
    for (const id of [hidden, spam, dupe, shown]) {
      await emitPostCreated(id);
      await emitStatusChanges([{ id, previous: "open" }]);
      await emitVoteCreated(id);
    }
    // Only the visible post produced events (three kinds), none of the other three.
    const found = await deliveries();
    expect(found).toHaveLength(3);
    expect(found.every((d) => d.payload.includes(shown))).toBe(true);
    expect(found.some((d) => [hidden, spam, dupe].some((id) => d.payload.includes(id)))).toBe(
      false,
    );
  });

  it("post.status_changed is sent when a Notion poll moves a post", async () => {
    const who = await admin(),
      author = await writer();
    await add(who, URL_A, ["post.status_changed"]);
    const id = await post(author, { title: "Export" });
    await env.DB.prepare("UPDATE posts SET notion_page_id = ?, notion_revision = 1 WHERE id = ?")
      .bind("22222222-2222-4222-8222-222222222222", id)
      .run();
    queue.reset();
    const fake = fakeFetch({ properties: NOTION_SCHEMA }, list([notionRow("Planned", false, id)]));
    vi.stubGlobal("fetch", fake.fetch);
    const message: SyncMessage = { type: "notion.poll", since: SINCE, until: UNTIL, cursor: null };
    const ack = vi.fn();
    await consumeQueue({
      queue: "test",
      messages: [
        { id: "m", timestamp: new Date(), body: message, attempts: 1, ack, retry: vi.fn() },
      ],
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    });
    expect(ack).toHaveBeenCalledOnce();
    const [delivery] = await deliveries();
    const envelope = JSON.parse(delivery!.payload) as WebhookEnvelope<"post.status_changed">;
    expect(envelope.data).toMatchObject({
      previousStatus: "open",
      status: "planned",
      post: { id, title: "Export", status: "planned" },
    });
    expect(webhookMessages()).toHaveLength(1);
    // The same poll again changes nothing, so it sends nothing.
    queue.reset();
    const again = fakeFetch({ properties: NOTION_SCHEMA }, list([notionRow("Planned", false, id)]));
    vi.stubGlobal("fetch", again.fetch);
    await consumeQueue({
      queue: "test",
      messages: [
        { id: "m", timestamp: new Date(), body: message, attempts: 1, ack, retry: vi.fn() },
      ],
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    });
    expect(await count("webhook_deliveries")).toBe(1);
    expect(ID).toBeTruthy();
  });

  it("changelog.published goes through the changelog sink and carries Markdown and plain text", async () => {
    const who = await admin();
    await add(who, URL_A, ["changelog.published"]);
    changelogPublishedSinks.push(emitChangelogWebhook);
    const created = await adminApi.changelogCreate(who, {
      title: "Release",
      body: "We shipped **dark mode**.",
    });
    await adminApi.changelogSetStatus(who, { id: created.id, published: true });
    await adminApi.changelogSetStatus(who, { id: created.id, published: true }); // not a transition
    await flushWaitUntil();
    const all = await deliveries();
    expect(all).toHaveLength(1);
    const envelope = JSON.parse(all[0]!.payload) as WebhookEnvelope<"changelog.published">;
    expect(envelope.data.entry).toMatchObject({
      id: created.id,
      title: "Release",
      body: "We shipped **dark mode**.",
      bodyText: "We shipped dark mode.",
      url: `${PORTAL}/changelog/${created.id}`,
      postIds: [],
    });
    expect(envelope.data.entry.publishedAt).toEqual(expect.any(String));
  });

  it("is registered as a changelog sink in production", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/server/changelog-events.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("changelogPublishedSinks.push(emitChangelogWebhook)");
  });

  it("never throw into the caller, and log no URL when they fail", async () => {
    const who = await admin();
    await add(who);
    await expect(
      emitWebhooks("vote.created", async () => {
        throw new Error(`boom ${URL_A}`);
      }),
    ).resolves.toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("hooks.example.com");
    expect(await count("webhook_deliveries")).toBe(0);
  });

  it("caps what one emit can create, and marks deliveries failed when the queue is down", async () => {
    const who = await admin();
    await add(who);
    await add(who, "https://two.example.com/");
    const post = { id: "p", title: "t", url: "https://x/p", votes: 1 };
    await emitWebhooks("vote.created", async () => Array.from({ length: 200 }, () => ({ post })));
    expect(await count("webhook_deliveries")).toBe(WEBHOOK_LIMITS.perEmit);
    await env.DB.prepare("DELETE FROM webhook_deliveries").run();
    queue.failNext();
    await emitWebhooks("vote.created", async () => [{ post }]);
    expect(await rows("SELECT status, last_error FROM webhook_deliveries")).toEqual([
      { status: "failed", last_error: "Could not be queued" },
      { status: "failed", last_error: "Could not be queued" },
    ]);
  });
});

describe("delivery", () => {
  it("signs t.body with the endpoint secret and records the delivery", async () => {
    const who = await admin();
    const made = await add(who, URL_A, ["vote.created"]);
    await adminApi.webhookTest(who, { id: made.endpoint.id });
    const sent = stubFetch(respond(204));
    const [result] = await consume();
    expect(result!.ack).toHaveBeenCalledOnce();
    expect(result!.retry).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request).toMatchObject({ url: URL_A });
    expect(request!.init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(request!.init.signal).toBeInstanceOf(AbortSignal);
    const header = request!.headers.get("x-feedbax-signature")!;
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header)!;
    expect(Math.abs(Number(t) - Date.now() / 1000)).toBeLessThan(30);
    expect(v1).toBe(
      createHmac("sha256", made.secret).update(`${t}.${request!.body}`).digest("hex"),
    );
    expect(await signWebhook(made.secret, request!.body, Number(t))).toBe(header);
    expect(request!.headers.get("content-type")).toBe("application/json");
    expect(request!.headers.get("x-feedbax-event")).toBe("webhook.test");
    const envelope = envelopeOf(request!);
    expect(request!.headers.get("x-feedbax-delivery")).toBe((await deliveries())[0]!.id);
    expect(envelope).toMatchObject({ type: "webhook.test", data: { message: expect.any(String) } });
    expect(await deliveries()).toMatchObject([
      { status: "delivered", attempts: 1, response_status: 204, last_error: null },
    ]);
    // The receiver's answer is never stored.
    expect(JSON.stringify(await deliveries())).not.toContain("secret receiver body");
    // A duplicate queue message does not send again.
    queue.sent.push({ type: "webhook.deliver", deliveryId: (await deliveries())[0]!.id });
    expect((await consume())[0]!.ack).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(1);
  });

  it("retries 5xx and network errors with backoff, then fails for good", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookTest(who, { id: endpoint.id });
    const sent = stubFetch(respond(500));
    const message = queue.sent[0]!;
    for (let attempt = 1; attempt < WEBHOOK_LIMITS.attempts; attempt++) {
      const [result] = await consume(attempt);
      expect(result!.retry, `attempt ${attempt}`).toHaveBeenCalledWith({
        delaySeconds: WEBHOOK_RETRY_SECONDS[attempt - 1],
      });
      expect(result!.ack).not.toHaveBeenCalled();
      expect(await deliveries()).toMatchObject([
        { status: "pending", attempts: attempt, response_status: 500, last_error: "HTTP 500" },
      ]);
      queue.sent.push(message);
    }
    const [last] = await consume(WEBHOOK_LIMITS.attempts);
    expect(last!.ack).toHaveBeenCalledOnce();
    expect(last!.retry).not.toHaveBeenCalled();
    expect(await deliveries()).toMatchObject([
      { status: "failed", attempts: WEBHOOK_LIMITS.attempts, last_error: "HTTP 500" },
    ]);
    expect(sent).toHaveLength(WEBHOOK_LIMITS.attempts);
    // The first retry is soon, the later ones are spread out.
    expect(WEBHOOK_RETRY_SECONDS[0]).toBeLessThanOrEqual(60);
    expect(WEBHOOK_RETRY_SECONDS.at(-1)).toBeGreaterThanOrEqual(3600);
  });

  it("gives up at once on a client error, but retries 429 and honours Retry-After", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookTest(who, { id: endpoint.id });
    stubFetch(respond(404));
    const [gone] = await consume();
    expect(gone!.ack).toHaveBeenCalledOnce();
    expect(await deliveries()).toMatchObject([
      { status: "failed", attempts: 1, response_status: 404, last_error: "HTTP 404" },
    ]);

    await env.DB.prepare("DELETE FROM webhook_deliveries").run();
    await adminApi.webhookTest(who, { id: endpoint.id });
    stubFetch(respond(429, { "Retry-After": "900" }));
    const [limited] = await consume();
    expect(limited!.retry).toHaveBeenCalledWith({ delaySeconds: 900 });
    expect(await deliveries()).toMatchObject([{ status: "pending", last_error: "HTTP 429" }]);
  });

  it("times out, never follows a redirect and reports fixed phrases only", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookTest(who, { id: endpoint.id });
    stubFetch(fail(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
    const [timedOut] = await consume();
    expect(timedOut!.retry).toHaveBeenCalledWith({ delaySeconds: WEBHOOK_RETRY_SECONDS[0] });
    expect((await deliveries())[0]!.last_error).toBe("Timed out");

    queue.sent.push({ type: "webhook.deliver", deliveryId: (await deliveries())[0]!.id });
    const sent = stubFetch(respond(302, { Location: "http://169.254.169.254/latest" }));
    const [redirected] = await consume(2);
    expect(redirected!.ack).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(1); // the Location was not requested
    expect(await deliveries()).toMatchObject([
      { status: "failed", last_error: "Redirect (HTTP 302) not followed" },
    ]);

    await env.DB.prepare("DELETE FROM webhook_deliveries").run();
    await adminApi.webhookTest(who, { id: endpoint.id });
    stubFetch(fail(new Error(`connect ECONNREFUSED ${URL_A}`)));
    await consume();
    expect((await deliveries())[0]!.last_error).toBe("Connection failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("hooks.example.com");
  });

  it("does not send to a deleted, paused or newly disallowed endpoint", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookTest(who, { id: endpoint.id });
    await adminApi.webhookUpdate(who, { id: endpoint.id, enabled: false });
    const sent = stubFetch(respond(200));
    const [paused] = await consume();
    expect(paused!.ack).toHaveBeenCalledOnce();
    expect(await deliveries()).toMatchObject([
      { status: "failed", last_error: "Endpoint is disabled" },
    ]);

    // A row that predates a stricter rule: production refuses a private address at send time.
    await adminApi.webhookUpdate(who, { id: endpoint.id, enabled: true });
    await env.DB.prepare("UPDATE webhook_endpoints SET url = 'http://10.0.0.5/x'").run();
    env.PORTAL_URL = "https://portal.example.com";
    await adminApi.webhookTest(who, { id: endpoint.id });
    const [blocked] = await consume();
    expect(blocked!.ack).toHaveBeenCalledOnce();
    expect(await deliveries()).toMatchObject([
      { last_error: "Endpoint is disabled" },
      { status: "failed", attempts: 0, last_error: "Address is not allowed" },
    ]);

    // Deleted while waiting: the message is simply acknowledged.
    queue.sent.push({ type: "webhook.deliver", deliveryId: crypto.randomUUID() });
    expect((await consume())[0]!.ack).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(0);
  });

  it("signs a retry with the rotated secret", async () => {
    const who = await admin();
    const made = await add(who);
    await adminApi.webhookTest(who, { id: made.endpoint.id });
    const sent = stubFetch(respond(500), respond(200));
    const message = queue.sent[0]!;
    await consume();
    const rotated = await adminApi.webhookRotateSecret(who, { id: made.endpoint.id });
    queue.sent.push(message);
    await consume(2);
    const [first, second] = sent;
    const check = (request: Sent, secret: string) => {
      const [, t, v1] = /^t=(\d+),v1=(\w+)$/.exec(request.headers.get("x-feedbax-signature")!)!;
      return v1 === createHmac("sha256", secret).update(`${t}.${request.body}`).digest("hex");
    };
    expect(check(first!, made.secret)).toBe(true);
    expect(check(second!, rotated.secret)).toBe(true);
    expect(first!.body).toBe(second!.body); // every retry sends the same bytes
  });

  it("does not disturb the Notion and GitHub sync state when a webhook fails", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookTest(who, { id: endpoint.id });
    stubFetch(respond(500));
    await consume();
    expect(await count("sync_state")).toBe(0);
  });
});

describe("the delivery log", () => {
  it("shows recent deliveries with status, and the last result per endpoint", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookTest(who, { id: endpoint.id });
    stubFetch(respond(200));
    await consume();
    const listed = await adminApi.webhooksList(who, undefined);
    expect(listed.deliveries).toMatchObject([
      {
        endpointId: endpoint.id,
        endpointUrl: URL_A,
        event: "webhook.test",
        status: "delivered",
        attempts: 1,
        responseStatus: 200,
        error: null,
      },
    ]);
    expect(listed.endpoints[0]!.last).toMatchObject({ status: "delivered" });
    expect(JSON.stringify(listed)).not.toContain("payload");
  });

  it("keeps the newest deliveries per endpoint and only lists the most recent", async () => {
    const who = await admin();
    const a = await add(who);
    const b = await add(who, "https://b.example.com/");
    const insert = env.DB.prepare(
      "INSERT INTO webhook_deliveries (id, endpoint_id, event, payload, status, attempts, created_at, updated_at) VALUES (?, ?, 'vote.created', '{}', 'delivered', 1, ?, ?)",
    );
    await env.DB.batch(
      Array.from({ length: WEBHOOK_LIMITS.historyPerEndpoint + 20 }, (_, i) =>
        insert.bind(`old-${i}`, a.endpoint.id, 1000 + i, 1000 + i),
      ),
    );
    await env.DB.batch([insert.bind("b-1", b.endpoint.id, 1, 1)]);
    // The next delivery for `a` prunes its history; `b` keeps its row.
    await adminApi.webhookTest(who, { id: a.endpoint.id });
    expect(await count("webhook_deliveries", `endpoint_id = '${a.endpoint.id}'`)).toBe(
      WEBHOOK_LIMITS.historyPerEndpoint,
    );
    expect(await count("webhook_deliveries", "id = 'old-0'")).toBe(0);
    expect(await count("webhook_deliveries", "id = 'old-119'")).toBe(1);
    expect(await count("webhook_deliveries", "id = 'b-1'")).toBe(1);
    const listed = await adminApi.webhooksList(who, undefined);
    expect(listed.deliveries).toHaveLength(WEBHOOK_LIMITS.recentDeliveries);
    expect(listed.deliveries[0]!.event).toBe("webhook.test"); // newest first
  });

  it("refuses a test for a paused endpoint", async () => {
    const who = await admin();
    const { endpoint } = await add(who);
    await adminApi.webhookUpdate(who, { id: endpoint.id, enabled: false });
    await expect(adminApi.webhookTest(who, { id: endpoint.id })).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await count("webhook_deliveries")).toBe(0);
  });
});
