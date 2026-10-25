import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { createDeliveryModule } from "./delivery";

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());

// Measure the real storage boundary, including first() and batch(), without
// replacing SQLite or making assertions about the text of implementation SQL.
function meter(database: D1Database) {
  const totals = { reads: 0, writes: 0 };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const record = <
    T extends { meta: { rows_read: number; rows_written: number } },
  >(
    result: T,
  ) => {
    totals.reads += result.meta.rows_read;
    totals.writes += result.meta.rows_written;
    return result;
  };
  function statement(source: D1PreparedStatement): D1PreparedStatement {
    const measured = new Proxy(source, {
      get(target, key) {
        if (key === "bind")
          return (...values: unknown[]) => statement(target.bind(...values));
        if (key === "all") return async () => record(await target.all());
        if (key === "run") return async () => record(await target.run());
        if (key === "first")
          return async (column?: string) => {
            const result = record(await target.all());
            const row = result.results[0];
            return row ? (column === undefined ? row : row[column]) : null;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(measured, source);
    return measured;
  }
  return {
    totals,
    database: new Proxy(database, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => statement(target.prepare(sql));
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) =>
            (
              await target.batch(
                statements.map((item) => originals.get(item) ?? item),
              )
            ).map(record);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
}

it("keeps idle hourly maintenance cheap with thousands of retained tombstones and NULL payload receipts", async () => {
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
  expect(measured.totals.reads).toBeLessThan(100);
  expect(measured.totals.writes).toBe(0);
  // Keep the measurement in test output so changes to the budget are reviewable.
  console.info(
    "Idle maintenance with 5,000 work tombstones and 1,000 receipts:",
    { ...measured.totals },
  );
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
  await active.processRevocation();
  expect((await active.processWork("ready")).completed).toBe(1);
  expect(measured.totals.reads).toBeLessThan(100);
  console.info("Event delivery with 3,000 future jobs and 5,000 tombstones:", {
    ...measured.totals,
  });
});
