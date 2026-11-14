import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { Route as RootRoute } from "@/routes/__root";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("favicon", () => {
  it("links the F mark svg from every page", async () => {
    const head = await RootRoute.options.head!({} as never);
    expect(head!.links).toContainEqual({
      rel: "icon",
      type: "image/svg+xml",
      href: "/favicon.svg",
    });
  });

  it("ships a square mark that follows the color scheme, and redirects /favicon.ico", () => {
    const svg = read("public/favicon.svg");
    expect(svg).not.toMatch(/\brx=/);
    expect(svg).toContain("prefers-color-scheme:dark");
    expect(read("public/_redirects")).toMatch(/^\/favicon\.ico \/favicon\.svg 301$/m);
  });
});
