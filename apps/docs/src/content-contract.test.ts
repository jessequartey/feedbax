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
