import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { flushWaitUntil, queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import type { EmailMessage } from "../../src/contracts/sync.ts";
import { changelogEmailSink } from "../../src/email/changelog.ts";
import { richText } from "../../src/email/content.ts";
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
    expect(digestDue("2026-01-01T00:00:00.000Z", now)!.since).toBe("2026-11-07T12:00:00.000Z");
    expect(digestDue(undefined, now)!.since).toBe("2026-11-13T12:00:00.000Z");
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
    expect(new Set(sent.calls.map((call) => call.headers.get("idempotency-key"))).size).toBe(1);
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

  it("sends a 409 once more under a fresh idempotency key", async () => {
    const sent = stubResend(409, 200);
    const { ack, retry } = await consume(message());
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(sent.calls.map((call) => call.headers.get("idempotency-key"))).toEqual([
      "feedbax/status-9/-/0",
      "feedbax/status-9/-/0/conflict",
    ]);
  });

  it("drops a 409 that still conflicts on the fresh key", async () => {
    const sent = stubResend(409, 409);
    const { ack, retry } = await consume(message());
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(sent.calls).toHaveLength(2);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("email.failure");
    expect(logged).not.toMatch(/re_test|@example\.com/);
  });

  it("resends a 422 batch one recipient at a time and drops only the bad address", async () => {
    await account("voter");
    await vote(POST, "voter");
    const sent = stubResend(422, 200, 422);
    const { ack, retry } = await consume(message());
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(sent.calls.map((call) => call.emails.length)).toEqual([2, 1, 1]);
    expect(sent.calls.map((call) => call.headers.get("idempotency-key"))).toEqual([
      "feedbax/status-9/-/0",
      "feedbax/status-9/-/0/0",
      "feedbax/status-9/-/0/1",
    ]);
    // The batch was refused. The author is sent alone; the bad address is refused alone.
    expect(sent.calls[1]!.emails.map((email) => email.to)).toEqual([["author@example.com"]]);
    expect(sent.calls[2]!.emails.map((email) => email.to)).toEqual([["voter@example.com"]]);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain('"status":422');
    expect(logged).not.toMatch(/@example\.com/);
  });

  it("retries when Resend cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const { retry } = await consume(message());
    expect(retry).toHaveBeenCalledOnce();
  });

  it("sends a large audience in slices, each queued as a follow-up with the last user id", async () => {
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
    expect(sent.calls.map((call) => call.emails.length)).toEqual([100, 100]);
    const [next] = queued();
    expect(next).toMatchObject({ type: "email.status", id: "status-9", after: expect.any(String) });
    sent.calls.length = 0;
    await consume(next!);
    expect(sent.emails().length).toBeGreaterThan(0);
    expect(sent.emails().length).toBeLessThanOrEqual(6);
  });
});
