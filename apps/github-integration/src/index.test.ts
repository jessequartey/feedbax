import type { MessageBatch, Queue } from "@cloudflare/workers-types";
import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import worker from "./index";

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());
it("routes authenticated HTTP ingress through the Queue consumer, including retry acknowledgements", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).sort())
    await database.exec(
      (await readFile(new URL(file, migrations), "utf8"))
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  await database.exec(
    "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at) VALUES('portal','https://portal.account.workers.dev',99,123,'acme','feedback',456,0);",
  );
  type Signal = { workId: string } | "feedbax-github-maintenance-v1";
  const signals: Signal[] = [];
  const metadata = { metrics: { backlogCount: 0, backlogBytes: 0 } };
  const queue: Queue<Signal> = {
    send: async (body) => {
      signals.push(body);
      return { metadata };
    },
    sendBatch: async () => {
      throw new Error("Unexpected batch send");
    },
    metrics: async () => metadata.metrics,
  };
  let available = false;
  let deliveries = 0;
  const bodies: string[] = [];
  const environment = {
    FEEDBAX_APP_DB: database,
    INTEGRATION_DELIVERY_QUEUE: queue,
    SERVICE_ORIGIN: "https://service.example",
    TRUSTED_PORTAL_ORIGINS: '["https://portal.account.workers.dev"]',
    PORTAL_SERVICE_BINDINGS: '{"https://portal.account.workers.dev":"PORTAL"}',
    PORTAL: {
      fetch: async (request: Request) => {
        bodies.push(await request.text());
        deliveries++;
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
  const webhook = async (id: string, event = "issues", action = "labeled") => {
    const body = JSON.stringify({
      installation: { id: 99 },
      repository: { id: 123 },
      action,
    });
    return worker.fetch(
      new Request("https://service.example/webhooks/github", {
        method: "POST",
        headers: {
          "X-GitHub-Event": event,
          "X-GitHub-Delivery": id,
          "X-Hub-Signature-256": `sha256=${createHmac("sha256", "webhook-secret").update(body).digest("hex")}`,
        },
        body,
      }),
      environment,
    );
  };
  let acks = 0;
  const retries: number[] = [];
  const batch = (body: unknown): MessageBatch<unknown> => ({
    queue: "delivery",
    metadata,
    messages: [
      {
        id: "message",
        timestamp: new Date(),
        attempts: 1,
        body,
        ack: () => {
          acks++;
        },
        retry: (options) => {
          retries.push(options?.delaySeconds ?? 0);
        },
      },
    ],
    ackAll: () => {
      throw new Error("Unexpected batch ack");
    },
    retryAll: () => {
      throw new Error("Unexpected batch retry");
    },
  });
  expect((await webhook("unavailable")).status).toBe(202);
  expect(signals).toHaveLength(1);
  expect(Object.keys(signals[0]!)).toEqual(["workId"]);
  await worker.queue(batch(signals[0]), environment);
  expect(acks).toBe(0);
  expect(retries[0]).toBeGreaterThanOrEqual(60);
  await worker.queue(batch(signals[0]), environment);
  expect(deliveries).toBe(1);
  available = true;
  await webhook("available");
  await worker.queue(batch(signals[1]), environment);
  await worker.queue(batch(signals[1]), environment);
  await worker.queue(batch({ invalid: "payload" }), environment);
  expect(acks).toBe(3);
  expect(deliveries).toBe(2);
  const health = await worker.fetch(
    new Request("https://service.example/health"),
    environment,
  );
  expect(health.status).toBe(200);
  await webhook("content-before-revoke");
  await webhook("uninstall", "installation", "deleted");
  const revocation = signals[3];
  if (!revocation || typeof revocation !== "object")
    throw new Error("Missing revocation reference");
  await worker.queue(batch(signals[2]), environment);
  expect(JSON.parse(bodies.at(-2)!)).toMatchObject({
    eventId: revocation.workId,
    kind: "revoke",
  });
  await worker.queue(batch(revocation), environment);
  await worker.scheduled(undefined, environment);
  expect(signals.at(-1)).toBe("feedbax-github-maintenance-v1");
  await worker.queue(batch(signals.at(-1)), environment);
  expect(acks).toBe(6);
});
