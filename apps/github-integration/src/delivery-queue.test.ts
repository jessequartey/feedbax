import { afterEach, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createTestStorage } from "./test-support";
import { createHmac } from "node:crypto";
import { createDeliveryModule } from "./delivery";

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());
async function setup() {
  const storage = await createTestStorage();
  runtime = storage.runtime;
  const { database } = storage;
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

it("acknowledges a durable commit and recovers a failed Queue send from the same receipt", async () => {
  const { ingest, delivery, database, signals, queueUnavailable } =
    await setup();
  queueUnavailable(true);
  expect((await ingest()).status).toBe(202);
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

it("recovers persisted work after a lost Queue signal", async () => {
  const { ingest, delivery, signals, advance } = await setup();
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
  expect(await delivery.processWork(signals[0]!)).toMatchObject({
    deferredUntil: Date.UTC(2026, 9, 26),
  });
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

it.each([5, 6])(
  "applies generation-fenced cooldown to abandoned work after %i attempts",
  async (attempts) => {
    const { database, delivery, ingest, signals, advance } = await setup();
    await ingest();
    await database
      .prepare("UPDATE portal_work SET attempts=? WHERE id=?")
      .bind(attempts, signals[0])
      .run();
    await delivery.processWork(signals[0]!);
    advance(3600_000);
    await delivery.maintain();
    expect(
      await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
    ).toBe(1);
    expect(
      await database
        .prepare("SELECT cooldown_until FROM portal_bindings")
        .first("cooldown_until"),
    ).toBe(Date.UTC(2026, 9, 26));
  },
);

it("does not cool down a newly paired generation when abandoned older work is exhausted", async () => {
  const { database, delivery, ingest, signals } = await setup();
  await ingest();
  await database
    .prepare("UPDATE portal_work SET attempts=6 WHERE id=?")
    .bind(signals[0])
    .run();
  await database.prepare("UPDATE portal_bindings SET key_version=2").run();
  await delivery.processWork(signals[0]!);
  expect(
    await database
      .prepare("SELECT cooldown_until FROM portal_bindings")
      .first("cooldown_until"),
  ).toBe(0);
});

it("continues dispatching other bindings when a committed installation event loses one Queue signal", async () => {
  const { database, delivery, signals, queueUnavailable, advance } =
    await setup();
  await database.exec(
    "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at) VALUES('portal-b','https://portal-b.account.workers.dev',99,124,'acme','other',456,0)",
  );
  let calls = 0;
  const fanout = createDeliveryModule({
    database,
    appId: "123",
    webhookSecret: "webhook-secret",
    signingSecret: "s".repeat(40),
    now: () => Date.UTC(2026, 9, 25),
    deliver: async () => new Response(null, { status: 202 }),
    dispatch: async (id) => {
      calls++;
      if (calls === 1) throw new Error("Temporary Queue send failure");
      signals.push(id);
    },
  });
  const body = JSON.stringify({ installation: { id: 99 }, action: "suspend" });
  const response = await fanout.ingest(
    new Request("https://service.example/webhooks/github", {
      method: "POST",
      headers: {
        "X-GitHub-Event": "installation",
        "X-GitHub-Delivery": "fanout",
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", "webhook-secret").update(body).digest("hex")}`,
      },
      body,
    }),
  );
  expect(response.status).toBe(202);
  expect(calls).toBe(2);
  expect(signals).toHaveLength(1);
  expect(
    await database
      .prepare("SELECT count(*) n FROM portal_bindings WHERE active=0")
      .first("n"),
  ).toBe(2);
  queueUnavailable(false);
  advance(3600_000);
  await delivery.maintain();
  expect(signals).toHaveLength(3);
});

it("acknowledges unsupported authenticated events without creating receipts or delivery work", async () => {
  const { ingest, database, signals } = await setup();
  expect((await ingest("irrelevant", "push")).status).toBe(202);
  expect(signals).toEqual([]);
  expect(
    await database
      .prepare("SELECT count(*) n FROM webhook_receipts")
      .first("n"),
  ).toBe(0);
  expect(
    await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
  ).toBe(0);
});

it("does not spend Queue operations on a delay beyond the safe signal lifetime", async () => {
  const { database, delivery, ingest, signals, advance } = await setup();
  await ingest();
  const id = signals[0]!;
  signals.length = 0;
  const until = Date.UTC(2026, 9, 26);
  await database
    .prepare(
      "UPDATE portal_work SET next_attempt=?,dispatch_after=0 WHERE id=?",
    )
    .bind(until, id)
    .run();
  await delivery.dispatch(id);
  expect(signals).toEqual([]);
  advance(12 * 3600_000);
  await delivery.maintain();
  expect(signals).toEqual([]);
  advance(12 * 3600_000);
  await delivery.maintain();
  expect(signals).toEqual([id]);
  expect((await delivery.processWork(id)).completed).toBe(1);
});

it("does not terminalize an exhausted job while another consumer still owns its lease", async () => {
  const { database, delivery, ingest, signals, advance } = await setup();
  await ingest();
  await database
    .prepare("UPDATE portal_work SET attempts=5,lease_until=? WHERE id=?")
    .bind(Date.UTC(2026, 9, 25) + 60_000, signals[0])
    .run();
  expect((await delivery.processWork(signals[0]!)).retryAfter).toBe(60);
  expect(
    await database
      .prepare("SELECT cooldown_until FROM portal_bindings")
      .first("cooldown_until"),
  ).toBe(0);
  advance(60_000);
  await delivery.processWork(signals[0]!);
  expect(
    await database
      .prepare("SELECT cooldown_until FROM portal_bindings")
      .first("cooldown_until"),
  ).toBe(Date.UTC(2026, 9, 26) + 60_000);
});

it("returns a failure when receipt durability fails before dispatch", async () => {
  const { database, ingest, signals } = await setup();
  await database.exec(
    "CREATE TRIGGER fail_ingress BEFORE INSERT ON webhook_receipts BEGIN SELECT RAISE(ABORT,'storage unavailable'); END;",
  );
  expect((await ingest()).status).toBe(503);
  expect(signals).toEqual([]);
  expect(
    await database.prepare("SELECT count(*) n FROM portal_work").first("n"),
  ).toBe(0);
});
