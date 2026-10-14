import { describe, expect, it } from "vitest";

import { createPortalHead, createRouteHead } from "./portal-head";

describe("portal document branding", () => {
  it("uses the resolved product logo as the favicon", () => {
    expect(
      createPortalHead({
        name: "Acme",
        description: "Acme feedback",
        logo: "/brand/acme.svg",
      }).links,
    ).toContainEqual({
      rel: "icon",
      href: "/brand/acme.svg",
    });
  });
});

describe("route metadata", () => {
  it("builds canonical and social metadata from the configured site URL", () => {
    const head = createRouteHead(
      {
        name: "Acme",
        description: "Acme feedback",
        logo: "/logo.svg",
        siteUrl: "https://feedback.acme.test",
      },
      {
        title: "Roadmap",
        description: "See what Acme is building.",
        path: "/roadmap",
      },
    );
    expect(head.meta).toContainEqual({ title: "Roadmap · Acme" });
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: "https://feedback.acme.test/roadmap",
    });
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://feedback.acme.test/roadmap" },
    ]);
  });

  it("marks private-facing routes noindex", () => {
    expect(
      createRouteHead(
        { name: "Acme", description: "Feedback", logo: "/logo.svg" },
        { path: "/submit", noIndex: true },
      ).meta,
    ).toContainEqual({ name: "robots", content: "noindex" });
  });
});
