import type { MessageBatch, Queue } from "@cloudflare/workers-types";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createTestStorage, meter } from "./test-support";
import { bindingSecret } from "./binding-secret";
import { signIntegrationRequest } from "../../../packages/feedback/src/integration-auth";
import {
  cleanupSignal,
  maintenanceSignal,
  type DeliverySignal,
} from "./delivery";
import worker from "./index";

async function createFixture() {
  const storage = await createTestStorage();
  const { database } = storage;
  await database.exec(
    "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at) VALUES('portal','https://portal.account.workers.dev',99,123,'acme','feedback',456,0);",
  );
  const measured = meter(database);
  const signals: DeliverySignal[] = [];
  const delays: number[] = [];
  const metadata = { metrics: { backlogCount: 0, backlogBytes: 0 } };
  let queueAvailable = true;
  const queue: Queue<DeliverySignal> = {
    send: async (body, options) => {
      if (!queueAvailable) throw new Error("Queue unavailable");
      signals.push(body);
      delays.push(options?.delaySeconds ?? 0);
      return { metadata };
    },
    sendBatch: async () => {
      throw new Error("Unexpected batch send");
    },
    metrics: async () => metadata.metrics,
  };
  let available = true;
  const bodies: string[] = [];
  const environment = {
    FEEDBAX_APP_DB: measured.database,
    INTEGRATION_DELIVERY_QUEUE: queue,
    SERVICE_ORIGIN: "https://service.example",
    TRUSTED_PORTAL_ORIGINS: '["https://portal.account.workers.dev"]',
    PORTAL_SERVICE_BINDINGS: '{"https://portal.account.workers.dev":"PORTAL"}',
    PORTAL: {
      fetch: async (request: Request) => {
        bodies.push(await request.text());
        return new Response(null, { status: available ? 202 : 503 });
      },
    },
    GITHUB_APP_ID: "123",
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "unused",
    GITHUB_APP_PRIVATE_KEY: "unused",
    GITHUB_WEBHOOK_SECRET: "webhook-secret",
    INTEGRATION_SIGNING_SECRET: "s".repeat(40),
    PAIRING_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  function webhookRequest(id: string, event = "issues", action = "labeled") {
    const body = JSON.stringify({
      installation: { id: 99 },
      repository: { id: 123 },
      action,
    });
    return new Request("https://service.example/webhooks/github", {
      method: "POST",
      headers: {
        "X-GitHub-Event": event,
        "X-GitHub-Delivery": id,
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", "webhook-secret").update(body).digest("hex")}`,
      },
      body,
    });
  }
  async function consume(body: unknown, timestamp = new Date()) {
    const outcome: { acks: number; retries: number[] } = {
      acks: 0,
      retries: [],
    };
    const batch: MessageBatch<unknown> = {
      queue: "delivery",
      metadata,
      messages: [
        {
          id: "message",
          timestamp,
          attempts: 1,
          body,
          ack: () => {
            outcome.acks++;
          },
          retry: (options) => {
            outcome.retries.push(options?.delaySeconds ?? 0);
          },
        },
      ],
      ackAll: () => {
        throw new Error("Unexpected batch ack");
      },
      retryAll: () => {
        throw new Error("Unexpected batch retry");
      },
    };
    await worker.queue(batch, environment);
    return outcome;
  }
  function signed(path: string) {
    return signIntegrationRequest({
      url: `https://service.example${path}`,
      installationId: "portal",
      secret: bindingSecret(
        environment.INTEGRATION_SIGNING_SECRET,
        {
          installation_id: "portal",
          origin: "https://portal.account.workers.dev",
          github_installation_id: 99,
          repository_id: 123,
          key_version: 1,
        },
        "portal",
      ),
      body: "{}",
    });
  }
  return {
    ...storage,
    environment,
    signals,
    delays,
    bodies,
    totals: measured.totals,
    consume,
    signed,
    webhookRequest,
    webhook: (id: string, event?: string, action?: string) =>
      worker.fetch(webhookRequest(id, event, action), environment),
    setPortalAvailable: (value: boolean) => {
      available = value;
    },
    setQueueAvailable: (value: boolean) => {
      queueAvailable = value;
    },
  };
}
let fixture: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async () => {
  fixture = await createFixture();
});
afterEach(async () => fixture?.runtime.dispose());

it("queues authenticated ingress and delivers it within the D1 read/write budget", async () => {
  const f = fixture;
  expect((await f.webhook("accepted")).status).toBe(202);
  expect(Object.keys(f.signals[0]!)).toEqual(["workId"]);
  expect(await f.consume(f.signals[0])).toEqual({ acks: 1, retries: [] });
  expect(f.bodies).toHaveLength(1);
  expect(f.totals.reads).toBeLessThan(40);
  expect(f.totals.writes).toBeLessThan(40);
});

it("acknowledges a replay without delivering it again", async () => {
  await fixture.webhook("replay");
  await fixture.consume(fixture.signals[0]);
  expect(await fixture.consume(fixture.signals[0])).toEqual({
    acks: 1,
    retries: [],
  });
  expect(fixture.bodies).toHaveLength(1);
});

it("retries a failed delivery at its persisted time without spending an early attempt", async () => {
  fixture.setPortalAvailable(false);
  await fixture.webhook("retry");
  const first = await fixture.consume(fixture.signals[0]);
  expect(first.acks).toBe(0);
  expect(first.retries[0]).toBeGreaterThanOrEqual(60);
  await fixture.consume(fixture.signals[0]);
  expect(fixture.bodies).toHaveLength(1);
});

it("refreshes an old signal before its cumulative retry age reaches retention", async () => {
  fixture.setPortalAvailable(false);
  await fixture.webhook("old-signal");
  const result = await fixture.consume(
    fixture.signals[0],
    new Date(Date.now() - 23 * 3600_000),
  );
  expect(result).toEqual({ acks: 1, retries: [] });
  expect(fixture.signals).toHaveLength(2);
  expect(fixture.delays[1]).toBeLessThan(12 * 3600);
});

it("acknowledges a long cooldown and lets D1 recovery create a fresh signal when due", async () => {
  const until = Date.now() + 86400_000;
  await fixture.database
    .prepare("UPDATE portal_bindings SET cooldown_until=?")
    .bind(until)
    .run();
  await fixture.webhook("cooldown");
  expect(await fixture.consume(fixture.signals[0])).toEqual({
    acks: 1,
    retries: [],
  });
  expect(fixture.signals).toHaveLength(1);
  expect(
    await fixture.database
      .prepare("SELECT dispatch_after FROM portal_work")
      .first("dispatch_after"),
  ).toBe(until);
  expect(fixture.bodies).toEqual([]);
});

it("acknowledges an invalid Queue message without accessing D1", async () => {
  expect(await fixture.consume({ invalid: "payload" })).toEqual({
    acks: 1,
    retries: [],
  });
  expect(fixture.totals).toEqual({ reads: 0, writes: 0 });
});

it("serves health independently of Queue configuration", async () => {
  expect(
    (
      await worker.fetch(new Request("https://service.example/health"), {
        ...fixture.environment,
        INTEGRATION_DELIVERY_QUEUE: undefined,
      })
    ).status,
  ).toBe(200);
  expect(fixture.totals).toEqual({ reads: 0, writes: 0 });
});

it("keeps authenticated status available without a Queue binding", async () => {
  expect(
    (
      await worker.fetch(fixture.signed("/v1/status"), {
        ...fixture.environment,
        INTEGRATION_DELIVERY_QUEUE: undefined,
      })
    ).status,
  ).toBe(200);
});

it("acknowledges committed revocation even when its Queue notification fails", async () => {
  fixture.setQueueAvailable(false);
  const response = await worker.fetch(
    fixture.signed("/v1/revoke"),
    fixture.environment,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ revoked: true });
  expect(
    await fixture.database
      .prepare("SELECT active FROM portal_bindings")
      .first("active"),
  ).toBe(0);
  expect(
    await fixture.database
      .prepare(
        "SELECT count(*) n FROM portal_work WHERE kind='revoke' AND state='pending'",
      )
      .first("n"),
  ).toBe(1);
});

it("prioritizes a due revocation ahead of queued content", async () => {
  await fixture.webhook("content-before-revoke");
  await fixture.webhook("uninstall", "installation", "deleted");
  const revocation = fixture.signals[1];
  if (!revocation || typeof revocation !== "object")
    throw new Error("Missing revocation reference");
  await fixture.consume(fixture.signals[0]);
  expect(JSON.parse(fixture.bodies[0]!)).toMatchObject({
    eventId: revocation.workId,
    kind: "revoke",
  });
});

it("does not retry or process the referenced revocation twice", async () => {
  fixture.setPortalAvailable(false);
  await fixture.webhook("uninstall", "installation", "deleted");
  const result = await fixture.consume(fixture.signals[0]);
  expect(result.acks).toBe(0);
  expect(result.retries).toHaveLength(1);
  expect(fixture.bodies).toHaveLength(1);
  expect(fixture.totals.reads).toBeLessThan(25);
});

it("queues hourly maintenance without doing D1 work in the timer", async () => {
  await worker.scheduled(undefined, fixture.environment);
  expect(fixture.signals).toEqual([maintenanceSignal]);
  expect(fixture.totals).toEqual({ reads: 0, writes: 0 });
  expect((await fixture.consume(maintenanceSignal)).acks).toBe(1);
});

it("continues an expired-data backlog promptly without rerunning recovery", async () => {
  await fixture.database
    .prepare(
      "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<120) INSERT INTO portal_work(id,app_id,installation_id,kind,state,next_attempt,created_at,binding_version,failure_code) SELECT 'expired:'||n,'123','portal','reconcile','failed',0,?,1,'portal_unavailable' FROM seq",
    )
    .bind(Date.now() - 31 * 86400_000)
    .run();
  await fixture.consume(maintenanceSignal);
  expect(fixture.signals).toContain(cleanupSignal);
  expect(
    await fixture.database
      .prepare(
        "SELECT count(*) n FROM portal_work WHERE failure_code IS NOT NULL",
      )
      .first("n"),
  ).toBe(20);
  expect((await fixture.consume(cleanupSignal)).acks).toBe(1);
  expect(
    await fixture.database
      .prepare(
        "SELECT count(*) n FROM portal_work WHERE failure_code IS NOT NULL",
      )
      .first("n"),
  ).toBe(0);
});
