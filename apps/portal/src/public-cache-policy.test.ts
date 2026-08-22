import { describe, expect, it } from "vitest";

import {
  applyPublicCachePolicy,
  canonicalPublicRequest,
} from "./public-cache-policy";

describe("public portal cache policy", () => {
  it("marks only successful public projections with the agreed browser and edge freshness", () => {
    const response = applyPublicCachePolicy(
      new Request("https://feedback.example.com/roadmap"),
      Response.json({ lanes: [] }),
    );

    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
      "public, max-age=120, stale-while-revalidate=600, stale-if-error=86400",
    );
    expect(response.headers.get("cache-tag")).toBe(
      "feedbax-public,feedbax-roadmap",
    );
  });

  it("keeps mutations, private pages, and failed public reads out of the cache", () => {
    const cases = [
      [
        new Request("https://feedback.example.com/submit"),
        new Response("form"),
      ],
      [
        new Request("https://feedback.example.com/roadmap", {
          method: "POST",
        }),
        new Response("updated"),
      ],
      [
        new Request("https://feedback.example.com/roadmap"),
        new Response("unavailable", { status: 503 }),
      ],
    ] as const;

    for (const [request, source] of cases) {
      const response = applyPublicCachePolicy(request, source);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("cache-tag")).toBe(false);
    }
  });

  it("canonicalizes equivalent feedback filters before the cache sees the public projection", () => {
    const first = canonicalPublicRequest(
      new Request(
        "https://feedback.example.com/?status=New&type=Bug%20Report&ignored=value",
      ),
    );
    const second = canonicalPublicRequest(
      new Request("https://feedback.example.com/?type=Bug%20Report&status=New"),
    );

    expect(first?.url).toBe(
      "https://feedback.example.com/?status=New&type=Bug+Report&pageSize=25&sort=trending&schema=1",
    );
    expect(second?.url).toBe(first?.url);
  });

  it("does not canonicalize non-public routes", () => {
    const request = new Request(
      "https://feedback.example.com/submit?status=New&type=Bug%20Report",
    );

    expect(canonicalPublicRequest(request)).toBeUndefined();
  });

  it("versions detail and roadmap identities with their fixed projection policy", () => {
    expect(
      canonicalPublicRequest(
        new Request("https://feedback.example.com/roadmap"),
      )?.url,
    ).toBe(
      "https://feedback.example.com/roadmap?sort=updated-at-desc&schema=1",
    );
    expect(
      canonicalPublicRequest(new Request("https://feedback.example.com/p/slug"))
        ?.url,
    ).toBe("https://feedback.example.com/p/slug?schema=1");
  });
});
