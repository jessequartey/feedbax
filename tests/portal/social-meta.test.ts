import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { FEEDBAX_DESCRIPTION } from "@/contracts/brand";
import { portalUrlFromWrangler, publicOrigin, socialMeta } from "@/lib/social-meta";
import { Route as RootRoute } from "@/routes/__root";

const tag = (meta: Record<string, string>[], key: string) =>
  meta.find((m) => m.property === key || m.name === key)?.content;

describe("social meta", () => {
  it("the root head carries the large card tags", async () => {
    const head = await RootRoute.options.head!({} as never);
    expect(tag(head!.meta as never, "twitter:card")).toBe("summary_large_image");
    expect(tag(head!.meta as never, "og:image")).toBeTruthy();
    expect(tag(head!.meta as never, "twitter:image")).toBeTruthy();
  });

  it("uses absolute urls once the portal is on a public https origin", () => {
    const meta = socialMeta(FEEDBAX_DESCRIPTION, {
      name: "Acme feedback",
      portalUrl: "https://feedback.acme.dev/",
    });
    expect(tag(meta, "og:image")).toBe("https://feedback.acme.dev/og.png");
    expect(tag(meta, "twitter:image")).toBe("https://feedback.acme.dev/og.png");
    expect(tag(meta, "og:url")).toBe("https://feedback.acme.dev/");
    expect(tag(meta, "og:site_name")).toBe("Acme feedback");
    expect(tag(meta, "og:title")).toBe("Acme feedback");
    expect(tag(meta, "twitter:card")).toBe("summary_large_image");
    expect(tag(meta, "og:image:width")).toBe("1200");
    expect(tag(meta, "og:image:height")).toBe("600");
    expect(tag(meta, "og:image:alt")).toBeTruthy();
  });

  it("falls back to a relative image and no og:url for local or unknown urls", () => {
    for (const portalUrl of ["http://localhost:3000", "https://localhost", "", "nope", undefined]) {
      const meta = socialMeta(FEEDBAX_DESCRIPTION, { name: "Feedbax", portalUrl });
      expect(tag(meta, "og:image")).toBe("/og.png");
      expect(tag(meta, "og:url")).toBeUndefined();
    }
    expect(tag(socialMeta(FEEDBAX_DESCRIPTION), "og:image")).toBe("/og.png");
  });

  it("only treats public https origins as absolute", () => {
    expect(publicOrigin("https://a.b.workers.dev")).toBe("https://a.b.workers.dev");
    expect(publicOrigin("http://feedback.example.com")).toBeNull();
    expect(publicOrigin("https://127.0.0.1:8787")).toBeNull();
    expect(publicOrigin("https://user:pw@feedback.example.com")).toBeNull();
  });

  it("reads PORTAL_URL from the real wrangler.jsonc", () => {
    const source = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    expect(portalUrlFromWrangler(source)).toMatch(/^https?:\/\//);
    expect(portalUrlFromWrangler('{ "vars": { "PORTAL_URL": "https://x.dev" } }')).toBe(
      "https://x.dev",
    );
    expect(portalUrlFromWrangler("{}")).toBeNull();
  });

  it("ships public/og.png as a 1200×600 PNG under 1 MB", () => {
    const png = readFileSync(new URL("../../public/og.png", import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(600);
    expect(png.length).toBeLessThan(1_000_000);
  });
});
