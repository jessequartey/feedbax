import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createContentFeedbackModule } from "./configured-feedback";
import type { FeedbaxConfig } from "@feedbax/config";

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
it("runs a GitHub-only portal without Notion or verified identity and requires D1", async () => {
  const config: FeedbaxConfig = {
    provider: "github",
    product: {
      name: "Acme",
      description: "Feedback",
      logo: "/logo.svg",
      siteUrl: "https://portal.example",
    },
    theme: { preset: "lyra-neutral" },
    github: {
      installationId: "portal-acme",
      serviceUrl: "https://service.example",
      repository: { id: 123, owner: "acme", name: "feedback" },
      botUserId: 456,
    },
    features: { voting: true, comments: true, changelog: false },
    submissions: {
      moderation: "required",
      maxTitleLength: 160,
      maxDescriptionLength: 5000,
    },
    turnstile: { enabled: false },
  };
  expect(() => createContentFeedbackModule(config, {})).toThrow("FEEDBAX_DB");
  runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  const directory = resolve(import.meta.dirname, "../migrations");
  for (const file of (await readdir(directory)).sort())
    await database.exec(
      (await readFile(resolve(directory, file), "utf8"))
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  const urls: string[] = [];
  const feedback = createContentFeedbackModule(
    config,
    { FEEDBAX_DB: database, GITHUB_SERVICE_SECRET: "p".repeat(40) },
    async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      urls.push(request.url);
      if (request.url === "https://service.example/v1/token") {
        expect(request.headers.get("X-Feedbax-Installation")).toBe(
          "portal-acme",
        );
        expect(request.headers.get("X-Feedbax-Signature")).toMatch(
          /^[a-f0-9]{64}$/,
        );
        return Response.json({
          token: "scoped-access",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          repositoryId: 123,
          botUserId: 456,
        });
      }
      expect(request.headers.get("Authorization")).toBe("Bearer scoped-access");
      if (request.url === "https://api.github.com/repos/acme/feedback")
        return Response.json({ id: 123 });
      return Response.json([]);
    },
  );
  expect(await feedback.listPublicPosts()).toMatchObject({ items: [] });
  expect(urls.some((url) => url.includes("notion"))).toBe(false);
  expect(urls).toContain("https://service.example/v1/token");
});
