import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createDeliveryModule } from "./delivery";

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());
async function setup() {
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
  await database
    .prepare(
      "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at) VALUES('portal-a','https://portal-a.account.workers.dev',99,123,'acme','feedback',456,0)",
    )
    .run();
  let time = Date.UTC(2026, 9, 25);
  let available = true;
  let queueAvailable = true;
  const signals: string[] = [];
  const deliveries: string[] = [];
  const delivery = createDeliveryModule({
    database,
    appId: "123",
    webhookSecret: "webhook-secret",
    signingSecret: "s".repeat(40),
    now: () => time,
    dispatch: async (id) => {
      if (!queueAvailable) throw new Error("Queue unavailable");
      signals.push(id);
    },
    deliver: async (_, request) => {
      deliveries.push(await request.text());
      return new Response(null, { status: available ? 202 : 503 });
    },
  });
  const ingest = (id = "delivery-one", event = "issues", action = "opened") => {
    const body = JSON.stringify({
      action,
      installation: { id: 99 },
      repository: { id: 123 },
      issue: { body: "private engineering" },
    });
    return delivery.ingest(
      new Request("https://service.example/webhooks/github", {
        method: "POST",
        headers: {
          "X-GitHub-Event": event,
          "X-GitHub-Delivery": id,
          "X-Hub-Signature-256": `sha256=${createHmac("sha256", "webhook-secret").update(body).digest("hex")}`,
        },
        body,
      }),
    );
  };
  return {
    database,
    delivery,
    signals,
    deliveries,
    ingest,
    advance: (ms: number) => {
      time += ms;
    },
    unavailable: () => {
      available = false;
    },
    queueUnavailable: (value: boolean) => {
      queueAvailable = !value;
    },
  };
}

it("dispatches durable webhook work immediately and acknowledges queue replays without another delivery", async () => {
  const { ingest, delivery, signals, deliveries } = await setup();
  expect((await ingest()).status).toBe(202);
  expect(signals).toHaveLength(1);
  expect((await ingest()).status).toBe(202);
  expect(signals).toHaveLength(1);
  expect(await delivery.processWork(signals[0]!)).toEqual({
    completed: 1,
    failed: 0,
  });
  expect(await delivery.processWork(signals[0]!)).toEqual({
    completed: 0,
    failed: 0,
  });
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]).not.toContain("private engineering");
});

it("recovers a failed queue send from the same durable receipt", async () => {
  const { ingest, delivery, database, signals, queueUnavailable } =
    await setup();
  queueUnavailable(true);
  expect((await ingest()).status).toBe(503);
  expect(
    await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
  ).toBe(1);
  queueUnavailable(false);
  expect((await ingest()).status).toBe(202);
  expect(signals).toHaveLength(1);
  expect(await delivery.processWork(signals[0]!)).toEqual({
    completed: 1,
    failed: 0,
  });
});

it("uses persisted retry times and stops after five failed attempts, including duplicate queue deliveries", async () => {
  const {
    ingest,
    delivery,
    database,
    signals,
    deliveries,
    unavailable,
    advance,
  } = await setup();
  unavailable();
  await ingest();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await delivery.processWork(signals[0]!);
    expect(result.failed).toBe(1);
    if (attempt < 5) {
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(
        (await delivery.processWork(signals[0]!)).retryAfter,
      ).toBeGreaterThan(0);
      expect(deliveries).toHaveLength(attempt);
      advance(result.retryAfter! * 1000);
    } else expect(result.retryAfter).toBeUndefined();
  }
  expect(await delivery.processWork(signals[0]!)).toEqual({
    completed: 0,
    failed: 0,
  });
  expect(
    await database.prepare("SELECT state,attempts FROM portal_work").first(),
  ).toMatchObject({ state: "failed", attempts: 5 });
  advance(3600_000);
  await delivery.maintain();
  expect(
    await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
  ).toBe(1);
});

it("coalesces hourly recovery while older reconciliation is pending and does not poll during delivery processing", async () => {
  const { delivery, database, signals, advance } = await setup();
  expect(await delivery.process()).toEqual({ completed: 0, failed: 0 });
  expect(
    await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
  ).toBe(0);
  await delivery.maintain();
  expect(signals).toHaveLength(1);
  advance(3600_000);
  await delivery.maintain();
  expect(
    await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
  ).toBe(1);
});

it("recovers persisted work after a lost queue signal and ignores unsupported webhook events", async () => {
  const { ingest, delivery, signals, advance } = await setup();
  expect((await ingest("irrelevant", "push")).status).toBe(202);
  expect(signals).toEqual([]);
  await ingest();
  signals.length = 0;
  advance(3600_000);
  await delivery.maintain();
  expect(signals).toHaveLength(1);
  expect(await delivery.processWork(signals[0]!)).toEqual({
    completed: 1,
    failed: 0,
  });
});

it("leases concurrent queue deliveries and resumes work after an abandoned lease expires", async () => {
  const { ingest, delivery, database, signals, deliveries, advance } =
    await setup();
  await ingest();
  const results = await Promise.all([
    delivery.processWork(signals[0]!),
    delivery.processWork(signals[0]!),
  ]);
  expect(results.reduce((n, r) => n + r.completed, 0)).toBe(1);
  expect(deliveries).toHaveLength(1);
  await ingest("abandoned");
  await database
    .prepare(
      "UPDATE portal_work SET lease_until=?,attempts=1,dispatch_after=? WHERE id=?",
    )
    .bind(
      Date.UTC(2026, 9, 25) + 60_000,
      Date.UTC(2026, 9, 25) + 60_000,
      signals[1],
    )
    .run();
  expect((await delivery.processWork(signals[1]!)).retryAfter).toBe(60);
  expect(deliveries).toHaveLength(1);
  advance(60_000);
  expect((await delivery.processWork(signals[1]!)).completed).toBe(1);
});

it("delivers revocation during an outage cooldown without revoking a newer binding generation", async () => {
  const { ingest, delivery, database, signals, deliveries, advance } =
    await setup();
  await database
    .prepare("UPDATE portal_bindings SET cooldown_until=?")
    .bind(Date.UTC(2026, 9, 26))
    .run();
  await ingest();
  expect((await delivery.processWork(signals[0]!)).retryAfter).toBe(86400);
  expect(deliveries).toEqual([]);
  advance(3600_000);
  await delivery.maintain();
  expect(signals).toHaveLength(1);
  await ingest("uninstall", "installation", "deleted");
  expect((await delivery.processWork(signals[1]!)).completed).toBe(1);
  expect(deliveries[0]).toContain('"kind":"revoke"');
  await database
    .prepare("UPDATE portal_bindings SET key_version=2,active=1")
    .run();
  advance(86400_000);
  expect((await delivery.processWork(signals[0]!)).completed).toBe(1);
  expect(deliveries).toHaveLength(1);
});

it("bounds maintenance expiry and preserves replay tombstones and newer diagnostics", async () => {
  const { database, delivery } = await setup();
  const expired = Date.UTC(2026, 8, 1);
  await database
    .prepare(
      "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<120) INSERT INTO portal_work(id,app_id,installation_id,kind,state,next_attempt,created_at,binding_version,failure_code) SELECT 'expired:'||n,'123','portal-a','reconcile','failed',0,?,1,'portal_unavailable' FROM seq",
    )
    .bind(expired)
    .run();
  await delivery.maintain();
  expect(
    await database
      .prepare(
        "SELECT count(*) n FROM portal_work WHERE failure_code IS NOT NULL",
      )
      .first("n"),
  ).toBe(20);
  await delivery.maintain();
  expect(
    await database
      .prepare(
        "SELECT count(*) n FROM portal_work WHERE failure_code IS NOT NULL",
      )
      .first("n"),
  ).toBe(0);
  expect(
    await database
      .prepare("SELECT count(*) n FROM portal_work WHERE state='failed'")
      .first("n"),
  ).toBe(120);
});
