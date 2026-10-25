import { afterEach, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import { createTestStorage, meter } from "./test-support";
import { createDeliveryModule } from "./delivery";

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());

async function historyFixture() {
  const storage = await createTestStorage();
  runtime = storage.runtime;
  const { database } = storage;
  const time = Date.UTC(2026, 9, 25);
  await database
    .prepare(
      "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at,next_recovery_at) VALUES('portal','https://portal.account.workers.dev',99,123,'acme','feedback',456,0,?)",
    )
    .bind(time + 3600_000)
    .run();
  await database.exec(
    "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<5000) INSERT INTO portal_work(id,app_id,installation_id,kind,state,next_attempt,created_at,binding_version) SELECT 'old:'||n,'123','portal','reconcile','complete',0,0,1 FROM seq;",
  );
  await database.exec(
    "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<1000) INSERT INTO webhook_receipts(app_id,delivery_id,ingress_token,event,received_at,payload) SELECT '123','old:'||n,'receipt','issues',0,NULL FROM seq;",
  );
  const measured = meter(database);
  return { database, measured, time };
}

it("keeps idle maintenance below 20 reads and zero writes with 5,000 tombstones", async () => {
  const { measured, time } = await historyFixture();
  const delivery = createDeliveryModule({
    database: measured.database,
    appId: "123",
    webhookSecret: "w".repeat(40),
    signingSecret: "s".repeat(40),
    now: () => time,
    dispatch: async () => {
      throw new Error("Idle work must not dispatch");
    },
    deliver: async () => {
      throw new Error("Idle work must not deliver");
    },
  });
  await delivery.maintain();
  expect(measured.totals.reads).toBeLessThan(20);
  expect(measured.totals.writes).toBe(0);
  // Keep the measurement in test output so changes to the budget are reviewable.
  console.info(
    "Idle maintenance with 5,000 work tombstones and 1,000 receipts:",
    { ...measured.totals },
  );
});

it("delivers referenced work below 30 reads despite 3,000 future jobs and 5,000 tombstones", async () => {
  const { database, measured, time } = await historyFixture();
  await database
    .prepare(
      "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<3000) INSERT INTO portal_work(id,app_id,installation_id,kind,priority,next_attempt,created_at,binding_version,dispatch_after) SELECT 'future:'||n,'123','portal','reconcile',3,?,?,1,? FROM seq",
    )
    .bind(time + 86400_000, time, time + 86400_000)
    .run();
  await database
    .prepare(
      "INSERT INTO portal_work(id,app_id,installation_id,kind,priority,next_attempt,created_at,binding_version) VALUES('ready','123','portal','reconcile',2,?,?,1)",
    )
    .bind(time, time)
    .run();
  measured.totals.reads = 0;
  measured.totals.writes = 0;
  const active = createDeliveryModule({
    database: measured.database,
    appId: "123",
    webhookSecret: "w".repeat(40),
    signingSecret: "s".repeat(40),
    now: () => time,
    deliver: async () => new Response(null, { status: 202 }),
  });
  expect((await active.processQueuedWork("ready")).completed).toBe(1);
  expect(measured.totals.reads).toBeLessThan(30);
  console.info("Event delivery with 3,000 future jobs and 5,000 tombstones:", {
    ...measured.totals,
  });
});
