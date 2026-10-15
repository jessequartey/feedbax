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
      (await readFile(new URL(file, migrations), "utf8")).replace(/\s+/g, " "),
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
