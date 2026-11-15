import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import {
  createFakeQueue,
  flushWaitUntil,
  queue,
  resetEnv,
} from "../fixtures/cloudflare-workers.ts";
import type { EmailMessage } from "../../src/contracts/sync.ts";
import { changelogEmailSink } from "../../src/email/changelog.ts";
import { richText } from "../../src/email/content.ts";
import { measure } from "../resources/meter.ts";
import { deliveryKey } from "../../src/email/state.ts";
import { readState } from "../../src/sync/shared.ts";
import { saveEmailPrefs } from "../../src/email/prefs.ts";
import { EMAIL_SLICE } from "../../src/email/deliver.ts";
import { digestDue } from "../../src/email/events.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { changelogPublishedSinks } from "../../src/server/changelog-events.ts";
import { emitChangelogWebhook } from "../../src/server/webhooks.ts";
import { saveSettings } from "../../src/server/settings.ts";
import { runScheduled } from "../../src/sync/index.ts";
import {
  account,
  consume,
  disableEmail,
  enableEmail,
  post,
  queued,
  setPrefs,
  stubResend,
  vote,
} from "./helpers.ts";

const POST = "11111111-1111-4111-8111-111111111111";
const NOON = Date.parse("2026-11-14T12:00:00Z");

beforeEach(async () => {
  await resetEnv();
  enableEmail();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  Reflect.deleteProperty(env, "NOTIFY_QUEUE");
  disableEmail();
  // Other files clear this list (isolate: false). Put the production sinks back.
  changelogPublishedSinks.length = 0;
  changelogPublishedSinks.push(emitChangelogWebhook, changelogEmailSink);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await resetEnv();
});

describe("changelog entries (opt-in)", () => {
  async function publish(title = "Dark mode is here", body = "It **works**.") {
    const admin = await account(`admin-${crypto.randomUUID()}`, { role: "admin" });
    const who = { id: admin, name: "admin", kind: "account", admin: true } as const;
    // Registered with the list itself; test files that clear it leave it empty, so make sure.
    if (!changelogPublishedSinks.includes(changelogEmailSink))
      changelogPublishedSinks.push(changelogEmailSink);
    const created = await adminApi.changelogCreate(who, { title, body });
    await adminApi.changelogSetStatus(who, { id: created.id, published: true });
    await flushWaitUntil();
    return { who, entryId: created.id };
  }

  it("publishing only enqueues one message with Markdown and plain text", async () => {
    const sent = stubResend();
    await publish();
    expect(sent.calls).toEqual([]);
    expect(queued()).toEqual([
      expect.objectContaining({
        type: "email.changelog",
        entry: expect.objectContaining({
          title: "Dark mode is here",
          body: { markdown: "It **works**.", text: "It works." },
          url: expect.stringMatching(/^http:\/\/localhost:3000\/changelog\//),
        }),
      }),
    ]);
  });

  it("goes only to people who opted in", async () => {
    await account("optin");
    await account("default");
    await account("optout");
    await account("anon", { isAnonymous: true });
    await setPrefs("optin", { changelog: 1 });
    await setPrefs("optout", { changelog: 0 });
    await setPrefs("anon", { changelog: 1 });
    await publish();
    const sent = stubResend();
    const [message] = queued();
    await consume(message!);
    expect(sent.to()).toEqual(["optin@example.com"]);
    const [mail] = sent.emails();
    expect(mail!.subject).toBe("New in Feedbax: Dark mode is here");
    expect(mail!.headers["List-Unsubscribe"]).toContain("k=changelog");
    expect(mail!.text).toContain("It works.");
  });

  it("sends nothing when the entry was unpublished before the queue ran", async () => {
    await account("optin");
    await setPrefs("optin", { changelog: 1 });
    const { who, entryId } = await publish();
    await adminApi.changelogSetStatus(who, { id: entryId, published: false });
    const sent = stubResend();
    await consume(queued()[0]!);
    expect(sent.calls).toEqual([]);
  });

  it("queues nothing when email is off, and a failing queue never fails the publish", async () => {
    Reflect.deleteProperty(env, "NOTIFY_QUEUE");
    disableEmail();
    await publish();
    expect(queued()).toEqual([]);
    enableEmail();
    queue.failNext();
    await expect(publish("Second")).resolves.toBeDefined();
  });

  it("respects the admin's site switch", async () => {
    await account("optin");
    await setPrefs("optin", { changelog: 1 });
    await saveSettings({ notifications: { changelog: false } });
    await publish();
    const sent = stubResend();
    await consume(queued()[0]!);
    expect(sent.calls).toEqual([]);
  });
});

describe("admin digest", () => {
  const tick = (time = NOON) => runScheduled({ scheduledTime: time } as ScheduledController);

  it("is queued once a day on the cron, and recorded", async () => {
    await tick(Date.parse("2026-11-14T10:00:00Z"));
    expect(queued()).toEqual([
      expect.objectContaining({ type: "email.digest", id: "digest-2026-11-14" }),
    ]);
    queue.reset();
    await tick(Date.parse("2026-11-14T10:05:00Z"));
    expect(queued()).toEqual([]); // the same day is not queued twice

    queue.reset();
    await tick(Date.parse("2026-11-15T09:05:00Z"));
    expect(queued()).toEqual([
      expect.objectContaining({ type: "email.digest", id: "digest-2026-11-15" }),
    ]);
    queue.reset();
    await tick(Date.parse("2026-11-15T09:10:00Z"));
    expect(queued()).toEqual([]);
  });

  it("digestDue: nothing before the hour once sent, a week at most after a long gap", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(digestDue("2026-11-14T09:00:00.000Z", now)).toBeNull();
    const after = digestDue("2026-11-13T09:00:00.000Z", now)!;
    expect(after).toMatchObject({ id: "digest-2026-11-14", since: "2026-11-13T09:00:00.000Z" });
    expect(digestDue("2026-01-01T00:00:00.000Z", now)!.since).toBe("2026-11-07T09:00:00.000Z");
    expect(digestDue(undefined, now)!.since).toBe("2026-11-13T09:00:00.000Z");
  });

  it("lists the new public posts for admins only", async () => {
    const admin = await account("admin", { role: "admin" });
    await account("admin-off", { role: "admin" });
    await setPrefs("admin-off", { digest: 0 });
    await account("banned-admin", { role: "admin", bannedAt: 5 });
    await account("member");
    await post(POST, "member", { title: "Brand new", createdAt: NOON - 3_600_000 });
    await post("22222222-2222-4222-8222-222222222222", "member", {
      title: "Hidden one",
      createdAt: NOON - 3_600_000,
      hiddenAt: 1,
    });
    await post("33333333-3333-4333-8333-333333333333", "member", {
      title: "Old one",
      createdAt: NOON - 3 * 86_400_000,
    });
    const sent = stubResend();
    await consume({
      type: "email.digest",
      id: "digest-2026-11-14",
      since: new Date(NOON - 86_400_000).toISOString(),
      until: new Date(NOON).toISOString(),
    });
    expect(sent.to()).toEqual([`${admin}@example.com`]);
    const [mail] = sent.emails();
    expect(mail!.subject).toBe("1 new post on Feedbax");
    expect(mail!.text).toContain("Brand new");
    expect(mail!.text).not.toMatch(/Hidden one|Old one/);
    expect(mail!.headers["List-Unsubscribe"]).toContain("k=digest");
  });

  it("sends nothing on a day without new posts", async () => {
    await account("admin", { role: "admin" });
    const sent = stubResend();
    await consume({
      type: "email.digest",
      id: "digest-x",
      since: new Date(NOON - 86_400_000).toISOString(),
      until: new Date(NOON).toISOString(),
    });
    expect(sent.calls).toEqual([]);
  });
});

describe("delivery", () => {
  const message = (): EmailMessage => ({
    type: "email.status",
    id: "status-9",
    post: { id: POST, title: "Export", body: richText("Body") },
    from: "open",
    to: "done",
  });
  beforeEach(async () => {
    await account("author");
    await post(POST, "author");
  });

  it("retries a server error or rate limit with the same idempotency key, and sends once overall", async () => {
    const sent = stubResend(500, 429, 200);
    const first = await consume(message(), 1);
    expect(first.ack).not.toHaveBeenCalled();
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    const second = await consume(message(), 2);
    expect(second.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    const third = await consume(message(), 3);
    expect(third.ack).toHaveBeenCalledOnce();
    expect(new Set(sent.calls.map((call) => call.headers.get("idempotency-key")))).toEqual(
      new Set([await deliveryKey("email.status/status-9", "author")]),
    );
  });

  it("drops a permanent 403 instead of retrying it", async () => {
    stubResend(403);
    const { ack, retry } = await consume(message());
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    // The log carries the status, never the key or an address.
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("email.failure");
    expect(logged).not.toMatch(/re_test|@example\.com/);
  });

  it("records a conflicting key without evading deduplication", async () => {
    const sent = stubResend(409);
    const { ack, retry } = await consume(message());
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(sent.calls).toHaveLength(1);
    expect(await readState("email.error")).toMatchObject({ status: 409, code: "http_409" });
  });

  it("a bad address does not drop the other recipients or retry forever", async () => {
    await account("voter");
    await vote(POST, "voter");
    const sent = stubResend(422, 200);
    const { ack, retry } = await consume(message());
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(sent.calls.map((call) => call.emails.length)).toEqual([1, 1]);
    expect(sent.to()).toEqual(["author@example.com", "voter@example.com"]);
    expect(await readState("email.error")).toMatchObject({ status: 422 });
    await consume(message());
    expect(sent.calls).toHaveLength(2); // permanent failures and successes are terminal
  });

  it("skips completed sends even after the provider's 24-hour window", async () => {
    const sent = stubResend();
    await consume(message());
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86_400_000);
    await consume(message());
    expect(sent.calls).toHaveLength(1);
  });

  it("keeps a pending payload stable when settings change between attempts", async () => {
    const sent = stubResend(500, 200);
    await consume(message());
    await saveSettings({ name: "Changed portal" });
    await consume(message());
    expect(sent.calls[1]!.emails).toEqual(sent.calls[0]!.emails);
    expect(sent.calls[1]!.headers.get("idempotency-key")).toBe(
      sent.calls[0]!.headers.get("idempotency-key"),
    );
    expect(await readState("email.error")).toBeNull();
  });

  it("does not clear a failure when a redelivery sends nothing", async () => {
    stubResend(403);
    await consume(message());
    await consume(message());
    expect(await readState("email.error")).toMatchObject({ status: 403 });
  });

  it("surfaces an expired uncertain send instead of replaying outside provider retention", async () => {
    const sent = stubResend(500);
    await consume(message());
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 86_400_000);
    const result = await consume(message());
    expect(result.ack).toHaveBeenCalledOnce();
    expect(result.retry).not.toHaveBeenCalled();
    expect(sent.calls).toHaveLength(1);
    expect(await readState("email.error")).toMatchObject({ code: "idempotency_expired" });
  });

  it("re-checks unsubscribe immediately before each send", async () => {
    await account("voter");
    await vote(POST, "voter");
    const sent = stubResend();
    const fetcher = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        const response = await fetcher(...args);
        await saveEmailPrefs({ status: false }, { id: "voter", name: "Voter", kind: "account" });
        return response;
      }),
    );
    await consume(message());
    expect(sent.to()).toEqual(["author@example.com"]);
  });

  it("preserves every recipient across large continuations and a mid-slice failure", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `u${String(i).padStart(4, "0")}`);
    // Inline fixture values keep the fixture itself under D1's binding limit.
    await env.DB.prepare(
      `INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ${ids.map((id) => `('${id}','U','${id}@example.com',1,0,0)`).join(",")}`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO votes (post_id,user_id,created_at) SELECT '${POST}',id,2 FROM user WHERE id LIKE 'u%'`,
    ).run();
    const sent = stubResend(200, 200, 500);
    const first = await consume(message());
    expect(first.retry).toHaveBeenCalledOnce();
    // Removing a previously sent member shifts batch boundaries on retry.
    await setPrefs("author", { status_changes: 0 });
    await consume(message(), 2);
    for (let index = 0; index < queued().length; index++) {
      const continuation = queued()[index]!;
      await consume(continuation);
      const before = sent.calls.length;
      await consume(continuation); // redelivered continuation
      expect(sent.calls).toHaveLength(before);
      // The duplicate continuation enqueues the same next slice: consume it once.
      const unique = new Map(queued().map((item) => [item.after, item]));
      queue.sent.splice(0, queue.sent.length, ...unique.values());
    }
    const attempts = sent.calls.map((call) => call.headers.get("idempotency-key"));
    const failedKey = attempts[2]!;
    expect(attempts.filter((key) => key === failedKey)).toHaveLength(2);
    const successful = sent.calls
      .filter((_, index) => index !== 2)
      .flatMap((call) => call.emails.flatMap((email) => email.to));
    expect(successful).toHaveLength(ids.length + 1);
    expect(new Set(successful).size).toBe(ids.length + 1);
    expect(successful.sort()).toEqual(
      ["author@example.com", ...ids.map((id) => `${id}@example.com`)].sort(),
    );
  });

  it("retries a failed continuation enqueue without repeating completed sends", async () => {
    for (let i = 0; i < EMAIL_SLICE; i++) {
      await account(`u${i}`);
      await vote(POST, `u${i}`);
    }
    const sent = stubResend();
    queue.failNext();
    expect((await consume(message())).retry).toHaveBeenCalledOnce();
    expect(sent.calls).toHaveLength(EMAIL_SLICE);
    await consume(message(), 2);
    expect(sent.calls).toHaveLength(EMAIL_SLICE);
    expect(queued()).toHaveLength(1);
  });

  it("replays an accepted request with the identical key after a lost response", async () => {
    const accepted = new Set<string>();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        const key = new Headers(init?.headers).get("idempotency-key")!;
        accepted.add(key); // provider committed, but the first response was lost
        if (++calls === 1) throw new TypeError("connection lost");
        return Response.json({ data: [] });
      }),
    );
    expect((await consume(message())).retry).toHaveBeenCalledOnce();
    expect((await consume(message(), 2)).ack).toHaveBeenCalledOnce();
    expect(accepted.size).toBe(1);
    expect(calls).toBe(2);
  });

  it("bounds a full slice below the Free Worker subrequest limit", async () => {
    for (let i = 0; i < EMAIL_SLICE; i++) {
      await account(`u${i}`);
      await vote(POST, `u${i}`);
    }
    stubResend();
    const usage = await measure(() => consume(message()));
    // Settings + post + audience + insert/read ledger + per-recipient check/update + health.
    expect(usage.queries).toBeLessThanOrEqual(2 * EMAIL_SLICE + 6);
    expect(usage.fetches).toBe(EMAIL_SLICE);
    expect(usage.queries + usage.fetches + usage.queueCalls).toBeLessThan(50);
  });

  it("retries when Resend cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const { retry } = await consume(message());
    expect(retry).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    "sends follow-up slices to the delivery queue (binding present: %s)",
    async (dedicated) => {
      const notifications = createFakeQueue();
      if (dedicated) env.NOTIFY_QUEUE = notifications as unknown as Queue;
      const rows = Array.from(
        { length: EMAIL_SLICE + 5 },
        (_, index) => `('u${String(index).padStart(4, "0")}','U','u${index}@example.com',1,0,0)`,
      );
      await env.DB.prepare(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ${rows.join(",")}`,
      ).run();
      await env.DB.prepare(
        `INSERT INTO votes (post_id, user_id, created_at) SELECT '${POST}', id, 2 FROM user WHERE id LIKE 'u0%'`,
      ).run();
      const sent = stubResend();
      await consume(message());
      expect(sent.emails()).toHaveLength(EMAIL_SLICE);
      expect(sent.calls.every((call) => call.emails.length === 1)).toBe(true);
      const [next] = dedicated ? (notifications.sent as EmailMessage[]) : queued();
      if (dedicated) expect(queue.sent).toEqual([]);
      expect(next).toMatchObject({
        type: "email.status",
        id: "status-9",
        after: expect.any(String),
      });
      sent.calls.length = 0;
      await consume(next!);
      expect(sent.emails().length).toBeGreaterThan(0);
      expect(sent.emails().length).toBeLessThanOrEqual(6);
    },
  );
});
