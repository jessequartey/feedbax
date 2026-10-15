import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { createDeliveryModule } from "./delivery";

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());
it("polls a later binding even when the first portal is unavailable", async () => {
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
  for (const [id, repository] of [
    ["portal-a", 123],
    ["portal-b", 124],
  ] as const)
    await database
      .prepare(
        "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        `https://${id}.account.workers.dev`,
        99,
        repository,
        "acme",
        id,
        456,
        0,
      )
      .run();
  const destinations: string[] = [];
  let time = 1_000_000;
  const delivery = createDeliveryModule({
    database,
    appId: "123",
    webhookSecret: "w".repeat(40),
    signingSecret: "s".repeat(40),
    now: () => time,
    deliver: async (origin) => {
      destinations.push(origin);
      return new Response(null, {
        status: origin.includes("portal-a") ? 503 : 202,
      });
    },
  });
  expect(await delivery.process()).toEqual({ completed: 0, failed: 1 });
  time += 1000;
  expect(await delivery.process()).toEqual({ completed: 1, failed: 0 });
  expect(destinations).toEqual([
    "https://portal-a.account.workers.dev",
    "https://portal-b.account.workers.dev",
  ]);
});

it("does not deliver an obsolete revocation into a newly paired binding", async () => {
  const { createHmac } = await import("node:crypto");
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
  const time = 1_000_000;
  await database
    .prepare(
      "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at,last_polled_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      "portal-a",
      "https://portal-a.account.workers.dev",
      99,
      123,
      "acme",
      "feedback",
      456,
      0,
      time,
    )
    .run();
  const delivered: string[] = [];
  const delivery = createDeliveryModule({
    database,
    appId: "123",
    webhookSecret: "w".repeat(40),
    signingSecret: "s".repeat(40),
    now: () => time,
    deliver: async (_, request) => {
      delivered.push(await request.text());
      return new Response(null, { status: 202 });
    },
  });
  const send = (id: string, event: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    return delivery.ingest(
      new Request("https://service.example/webhooks/github", {
        method: "POST",
        headers: {
          "X-GitHub-Delivery": id,
          "X-GitHub-Event": event,
          "X-Hub-Signature-256": `sha256=${createHmac("sha256", "w".repeat(40)).update(body).digest("hex")}`,
        },
        body,
      }),
    );
  };
  expect(
    (
      await send("old-revoke", "installation", {
        installation: { id: 99 },
        action: "deleted",
      })
    ).status,
  ).toBe(202);
  // Represents a later authorized pairing/rotation completed before delivery.
  await database
    .prepare(
      "UPDATE portal_bindings SET key_version=2,active=1 WHERE installation_id='portal-a'",
    )
    .run();
  await delivery.process();
  expect(delivered).toEqual([]);
  expect((await delivery.status("portal-a")).active).toBe(true);
  expect(
    (
      await send("current-change", "issues", {
        installation: { id: 99 },
        repository: { id: 123 },
        action: "edited",
      })
    ).status,
  ).toBe(202);
  await delivery.process();
  expect(delivered).toHaveLength(1);
  expect(JSON.parse(delivered[0]!).kind).toBe("reconcile");
  // A real storage trigger interleaves a newly authorized pairing after ingress
  // reads the old generation, but before its durability batch commits.
  await database.exec(
    "CREATE TRIGGER rotate_during_ingress BEFORE INSERT ON webhook_receipts WHEN NEW.delivery_id='racing-revoke' BEGIN UPDATE portal_bindings SET key_version=3,active=1 WHERE installation_id='portal-a'; END;",
  );
  expect(
    (
      await send("racing-revoke", "installation", {
        installation: { id: 99 },
        action: "deleted",
      })
    ).status,
  ).toBe(202);
  expect((await delivery.status("portal-a")).active).toBe(true);
  await delivery.process();
  expect(delivered).toHaveLength(1);
});
