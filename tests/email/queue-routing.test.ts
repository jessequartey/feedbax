import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import type { EmailMessage, NotifyMessage } from "../../src/contracts/sync.ts";
import { consumeNotifications } from "../../src/notifications/consume.ts";
import { queueEmails } from "../../src/email/events.ts";
import { runScheduled } from "../../src/sync/index.ts";
import { readState } from "../../src/sync/shared.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { createFakeQueue, queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import { account, disableEmail, enableEmail, post, stubResend } from "./helpers.ts";

const digest: EmailMessage = {
  type: "email.digest",
  id: "digest-routing",
  since: "2026-11-13T12:00:00Z",
  until: "2026-11-14T12:00:00Z",
};

afterEach(async () => {
  Reflect.deleteProperty(env, "NOTIFY_QUEUE");
  disableEmail();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await resetEnv();
});

describe.each([true, false])("notification binding present: %s", (dedicated) => {
  it("routes email, webhooks and the daily digest; sync stays on SYNC_QUEUE", async () => {
    await resetEnv();
    const notifications = createFakeQueue();
    if (dedicated) env.NOTIFY_QUEUE = notifications as unknown as Queue;
    const destination = dedicated ? notifications : queue;
    await queueEmails([digest]);
    expect(destination.sent).toEqual([digest]);
    if (dedicated) expect(queue.sent).toEqual([]);

    const id = await account("admin", { role: "admin" });
    const who = { id, name: "Admin", kind: "account", admin: true } as const;
    const endpoint = await adminApi.webhookCreate(who, {
      url: "https://hooks.example.com/feedbax",
      events: ["post.created"],
    });
    await adminApi.webhookTest(who, { id: endpoint.endpoint.id });
    expect(destination.sent.at(-1)).toMatchObject({ type: "webhook.deliver" });
    if (dedicated) expect(queue.sent).toEqual([]);

    enableEmail();
    await runScheduled({ scheduledTime: Date.parse(digest.until) } as ScheduledController);
    expect(destination.sent.at(-1)).toMatchObject({
      type: "email.digest",
      id: "digest-2026-11-14",
    });
    expect(queue.sent.some((body) => body.type === "notion.poll")).toBe(true);
    if (dedicated) expect(queue.sent.every((body) => body.type.startsWith("notion."))).toBe(true);
    expect(await readState("email.digest")).toBe("2026-11-14T09:00:00.000Z");
  });
});

it("does not advance the digest watermark when the notification queue send fails", async () => {
  await resetEnv();
  enableEmail();
  const notifications = createFakeQueue();
  env.NOTIFY_QUEUE = notifications as unknown as Queue;
  notifications.failNext();
  await expect(
    runScheduled({ scheduledTime: Date.parse(digest.until) } as ScheduledController),
  ).rejects.toThrow();
  expect(await readState("email.digest")).toBeNull();
  expect(await readState("email.error")).toMatchObject({ code: "storage" });
});

it("retries a failed email without stopping the rest of a notification batch or changing sync state", async () => {
  await resetEnv();
  enableEmail();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const admin = await account("admin", { role: "admin" });
  await post("11111111-1111-4111-8111-111111111111", admin, {
    createdAt: Date.parse(digest.until) - 1000,
  });
  const sent = stubResend(500);
  const bodies: NotifyMessage[] = [digest, { type: "webhook.deliver", deliveryId: "missing" }];
  const messages = bodies.map((body, index) => ({
    id: String(index),
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  await consumeNotifications({
    queue: "custom-project-notify",
    messages,
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  });
  expect(sent.calls).toHaveLength(1);
  expect(messages[0]!.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  expect(messages[0]!.ack).not.toHaveBeenCalled();
  expect(messages[1]!.ack).toHaveBeenCalledOnce();
  expect(messages[1]!.retry).not.toHaveBeenCalled();
  expect(queue.sent).toContainEqual(bodies[1]);
  expect(await readState("notion.error")).toBeNull();
  expect(await readState("github.error")).toBeNull();
  expect(await readState("email.error")).toMatchObject({ status: 500 });
});

it("recovers failed initial enqueues on the existing cron state read", async () => {
  await resetEnv();
  enableEmail();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const notifications = createFakeQueue();
  env.NOTIFY_QUEUE = notifications as unknown as Queue;
  notifications.failNext();
  await queueEmails([digest]);
  expect(notifications.sent).toEqual([]);
  const outbox = await env.DB.prepare(
    "SELECT key FROM sync_state WHERE key LIKE 'email.outbox/%'",
  ).all();
  expect(outbox.results).toHaveLength(1);
  await runScheduled({ scheduledTime: Date.parse(digest.until) } as ScheduledController);
  expect(notifications.sent).toContainEqual(digest);
  expect(
    (await env.DB.prepare("SELECT key FROM sync_state WHERE key LIKE 'email.outbox/%'").all())
      .results,
  ).toEqual([]);
});

it("does not acknowledge notifications when forwarding the rest of a batch fails", async () => {
  await resetEnv();
  const notifications = createFakeQueue();
  env.NOTIFY_QUEUE = notifications as unknown as Queue;
  notifications.failNext();
  const messages = [0, 1].map((index) => ({
    id: String(index),
    timestamp: new Date(),
    attempts: 1,
    body: { type: "webhook.deliver", deliveryId: "missing" } as const,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  await expect(
    consumeNotifications({
      queue: "test-notify",
      messages,
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }),
  ).rejects.toThrow("send failed");
  expect(messages.every((message) => message.ack.mock.calls.length === 0)).toBe(true);
});
