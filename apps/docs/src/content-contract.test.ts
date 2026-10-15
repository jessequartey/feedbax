import { createHash } from "node:crypto";
import documentedConfiguration from "../examples/feedbax.config";
import { createFeedbackModule } from "../../../packages/feedback/src/index";
import { createTrustedFeedbackHandler } from "../../portal/src/trusted-feedback-handler";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const routes = [
  "index",
  "introduction",
  "getting-started/index",
  "getting-started/notion",
  "getting-started/deploy",
  "getting-started/custom-domain",
  "guides/notion-workflow",
  "guides/comments-and-voting",
  "guides/changelog",
  "guides/connected-profile",
  "guides/customization",
  "integrations/submission-api",
  "integrations/feedback-block",
  "operations/configuration",
  "operations/environment",
  "operations/cli",
  "operations/troubleshooting",
  "operations/security",
  "reference/notion-schema",
  "reference/routes",
  "reference/guarantees",
  "reference/version-0.2",
];

describe("documentation content contract", () => {
  it.each(routes)("provides metadata for %s", (route) => {
    const file = `${root}content/docs/${route}.mdx`;
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf8");
    expect(content).toMatch(/^---\ntitle: .+\ndescription: .+\n---/);
  });

  it("publishes every canonical route in the sitemap", () => {
    const sitemap = readFileSync(`${root}public/sitemap.xml`, "utf8");
    for (const route of routes.filter((route) => route !== "index")) {
      const slug = route.endsWith("/index") ? route.slice(0, -6) : route;
      expect(sitemap).toContain(`https://feedbax.dev/docs/${slug}`);
    }
  });
});

it("keeps the documented complete configuration valid", () => {
  expect(documentedConfiguration.features.changelog).toBe(true);
  expect(documentedConfiguration.changelog?.properties.body).toBeTruthy();
});

it("accepts the documented curl payload through the real trusted Worker handler", async () => {
  const script = readFileSync(`${root}examples/trusted-submission.sh`, "utf8");
  const payload = /--data '([^']+)'/.exec(script)?.[1];
  if (!payload)
    throw new Error("Expected a documented JSON submission payload.");
  const key = "documentation-test-key";
  const handler = createTrustedFeedbackHandler({
    apiKeyHash: createHash("sha256").update(key).digest("base64url"),
    feedback: createFeedbackModule(),
    rateLimiter: { limit: async () => ({ success: true }) },
    limits: { maxTitleLength: 160, maxDescriptionLength: 5000 },
  });
  const response = await handler(
    new Request("https://feedback.example.com/api/v1/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Idempotency-Key": "docs-example",
        "Content-Type": "application/json",
      },
      body: payload,
    }),
  );
  expect(response.status).toBe(200);
  expect(((await response.json()) as { title: string }).title).toBe(
    "Export feedback as CSV",
  );
});
