import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createFeedbackModule,
  createObservedHistoryModule,
} from "@feedbax/feedback";
import { createPublicHistoryRequestHandler } from "./history-runtime";
let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
});
it("returns only current public observed history with no-store and rejects invalid requests", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  await database.exec(
    await readFile(
      existsSync("apps/portal/migrations/0009_observed_history.sql")
        ? "apps/portal/migrations/0009_observed_history.sql"
        : "migrations/0009_observed_history.sql",
      "utf8",
    ),
  );
  const feedback = createFeedbackModule();
  const history = createObservedHistoryModule({ database, feedback });
  const handle = createPublicHistoryRequestHandler({
    enabled: true,
    history,
    rateLimit: async () => true,
  });
  const response = await handle(
    new Request(
      "https://portal.example/internal/post-history?slug=unknown-post",
    ),
  );
  expect(response?.headers.get("Cache-Control")).toBe("no-store");
  expect(await response?.json()).toEqual({ available: false, items: [] });
  expect(
    (
      await handle(
        new Request(
          "https://portal.example/internal/post-history?slug=%2Fprivate",
        ),
      )
    )?.status,
  ).toBe(400);
  expect(
    (
      await handle(
        new Request(
          "https://portal.example/internal/post-history?slug=unknown-post",
          { method: "POST" },
        ),
      )
    )?.status,
  ).toBe(405);
  expect(
    await handle(new Request("https://portal.example/other")),
  ).toBeUndefined();
  expect(
    (
      await createPublicHistoryRequestHandler({
        enabled: false,
        history,
        rateLimit: async () => true,
      })(
        new Request(
          "https://portal.example/internal/post-history?slug=unknown-post",
        ),
      )
    )?.status,
  ).toBe(404);
});
