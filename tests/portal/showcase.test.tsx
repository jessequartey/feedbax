import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  dismissShowcase,
  isShowcaseDismissed,
  ShowcaseCard,
  SHOWCASE_DISMISSED_KEY,
} from "../../src/components/portal/showcase-card.tsx";
import { FEEDBAX_DESCRIPTION, FEEDBAX_REPO_URL } from "../../src/contracts/brand.ts";
import { defineConfig } from "../../src/contracts/config.ts";
import { Route as RootRoute } from "../../src/routes/__root.tsx";
import { renderPage, viewerOf } from "./helpers.tsx";

const NOTION = { notion: { dataSourceId: "00000000-0000-0000-0000-000000000000" } };

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  return store;
}

// vitest runs with isolate:false, so never leave stubs behind for other files.
afterEach(() => vi.unstubAllGlobals());

describe("showcase card", () => {
  it.each(["/", "/roadmap"])("renders on %s only when showcase is on", async (path) => {
    const off = await renderPage(<ShowcaseCard />, viewerOf(null, { showcase: false }), path);
    expect(off).not.toContain("Want a board like this?");
    const on = await renderPage(<ShowcaseCard />, viewerOf(null, { showcase: true }), path);
    expect(on).toContain("Want a board like this?");
  });

  it("is an accessible complementary region with the canonical description and a GitHub link", async () => {
    const html = await renderPage(<ShowcaseCard />, viewerOf(null, { showcase: true }));
    expect(html).toContain('role="complementary"');
    expect(html).toContain('aria-label="Get your own Feedbax"');
    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toContain(FEEDBAX_DESCRIPTION);
    const link = html.match(/<a [^>]*>Get it on GitHub →<\/a>/)?.[0] ?? "";
    expect(link).toContain(`href="${FEEDBAX_REPO_URL}"`);
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener"');
  });

  it("stays hidden once dismissed, and remembers the dismissal", async () => {
    const store = stubStorage();
    expect(isShowcaseDismissed()).toBe(false);
    dismissShowcase();
    expect(store.get(SHOWCASE_DISMISSED_KEY)).toBe("1");
    expect(isShowcaseDismissed()).toBe(true);
    const html = await renderPage(<ShowcaseCard />, viewerOf(null, { showcase: true }));
    expect(html).not.toContain("Want a board like this?");
  });

  it("survives blocked storage", async () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    expect(() => dismissShowcase()).not.toThrow();
    expect(isShowcaseDismissed()).toBe(false);
    const html = await renderPage(<ShowcaseCard />, viewerOf(null, { showcase: true }));
    expect(html).toContain("Want a board like this?");
  });
});

describe("showcase config", () => {
  it("defaults to false and accepts a boolean", () => {
    expect(defineConfig({ integrations: NOTION }).showcase).toBe(false);
    expect(defineConfig({ showcase: true, integrations: NOTION }).showcase).toBe(true);
  });

  it("rejects a non-boolean without echoing it, alongside other problems", () => {
    const input = { showcase: "secret-value", name: "", integrations: NOTION } as never;
    expect(() => defineConfig(input)).toThrow(/showcase: must be true or false/);
    expect(() => defineConfig(input)).toThrow(/name:/);
    expect(() => defineConfig(input)).not.toThrow(/secret-value/);
  });

  it("is off in the repo's own feedbax.config.ts", () => {
    const source = readFileSync(new URL("../../feedbax.config.ts", import.meta.url), "utf8");
    expect(source).toMatch(/^\s*showcase: false,/m);
  });
});

describe("shared description", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("is the README tagline, line 5", () => {
    expect(read("README.md").split("\n")[4]).toBe(FEEDBAX_DESCRIPTION);
  });

  it("is the create-feedbax package description", () => {
    expect(JSON.parse(read("packages/create-feedbax/package.json")).description).toBe(
      FEEDBAX_DESCRIPTION,
    );
  });

  it("is the document's SEO and social description", async () => {
    const head = await RootRoute.options.head?.({} as never);
    const meta: Record<string, string>[] = (head?.meta ?? []) as never;
    const content = (key: "name" | "property", value: string) =>
      meta.find((m) => m[key] === value) as { content: string } | undefined;
    expect(content("name", "description")?.content).toBe(FEEDBAX_DESCRIPTION);
    expect(content("property", "og:description")?.content).toBe(FEEDBAX_DESCRIPTION);
    expect(content("property", "og:title")?.content).toBe("Feedbax");
    expect(content("property", "og:type")?.content).toBe("website");
    expect(content("name", "twitter:card")?.content).toBe("summary_large_image");
  });
});
