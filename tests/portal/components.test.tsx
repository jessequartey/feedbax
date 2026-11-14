import { describe, expect, it } from "vite-plus/test";

import { SignInOptions } from "../../src/components/portal/sign-in-options.tsx";
import { PostList } from "../../src/components/portal/post-row.tsx";
import { SiteHeader } from "../../src/components/portal/site-header.tsx";
import { FilterPanel } from "../../src/components/portal/filter-panel.tsx";
import { accountUser, fixtureListPosts, hostUser } from "../fixtures/portal.ts";
import { baseConfig, renderPage, viewerOf } from "./helpers.tsx";

describe("header", () => {
  const appUrl = "https://app.example.com";

  it("shows Back to app for a host identity when appUrl is set", async () => {
    const html = await renderPage(<SiteHeader />, viewerOf(hostUser, { appUrl }));
    expect(html).toContain("Back to app");
    expect(html).toContain(`href="${appUrl}"`);
  });

  it.each([
    ["an account", accountUser, appUrl],
    ["a signed-out visitor", null, appUrl],
    ["a host identity without appUrl", hostUser, null],
  ])("hides Back to app for %s", async (_label, user, url) => {
    const html = await renderPage(<SiteHeader />, viewerOf(user, { appUrl: url }));
    expect(html).not.toContain("Back to app");
  });

  it("shows the product name and its initial, with no Changelog", async () => {
    const html = await renderPage(<SiteHeader />, viewerOf(null, { name: "Acme Feedback" }));
    expect(html).toContain("Acme Feedback");
    expect(html).toContain(">A<");
    expect(html).not.toMatch(/changelog/i);
    for (const label of ["Feedback", "Roadmap", "My feedback"]) expect(html).toContain(label);
  });

  it("offers Sign in when signed out, and the account menu when signed in", async () => {
    expect(await renderPage(<SiteHeader />, viewerOf(null))).toContain("Sign in");
    const signedIn = await renderPage(<SiteHeader />, viewerOf(accountUser));
    expect(signedIn).toContain("Account menu");
    expect(signedIn).toContain("Ada Lovelace");
  });

  it("has a theme control and a mobile menu button", async () => {
    const html = await renderPage(<SiteHeader />, viewerOf(null));
    expect(html).toContain('aria-label="Change theme"');
    expect(html).toContain('aria-label="Open menu"');
  });
});

describe("sign in and sign up", () => {
  it("shows OAuth buttons only for configured providers", async () => {
    const none = await renderPage(<SignInOptions config={baseConfig} />, viewerOf(null));
    expect(none).not.toContain("Continue with");

    const config = { ...baseConfig, oauth: { github: true, google: false } };
    const github = await renderPage(<SignInOptions config={config} />, viewerOf(null, config));
    expect(github).toContain("Continue with GitHub");
    expect(github).not.toContain("Continue with Google");

    const both = { ...baseConfig, oauth: { github: true, google: true } };
    const html = await renderPage(<SignInOptions config={both} />, viewerOf(null, both));
    expect(html).toContain("Continue with GitHub");
    expect(html).toContain("Continue with Google");
  });

  it("mentions anonymous browsing only when it is on", async () => {
    const off = await renderPage(<SignInOptions config={baseConfig} />, viewerOf(null));
    expect(off).not.toContain("without an account");
    const config = { ...baseConfig, anonymous: true };
    const on = await renderPage(<SignInOptions config={config} />, viewerOf(null, config));
    expect(on).toContain("without an account");
  });

  it("links back to the host app when appUrl is set", async () => {
    const config = { ...baseConfig, hostLogin: true, appUrl: "https://app.example.com" };
    const html = await renderPage(<SignInOptions config={config} />, viewerOf(null, config));
    expect(html).toContain("Continue in app.example.com");
  });

  it("shows an explicit unavailable state with no credential fields or orphan separator", async () => {
    const html = await renderPage(<SignInOptions config={baseConfig} />, viewerOf(null));
    expect(html).toContain("Sign-in isn&#x27;t configured");
    expect(html).not.toMatch(/<input|<form|Create an account|data-slot="separator"/);
  });
  it("shows a separator only between actual alternatives and preserves safe anonymous destinations", async () => {
    const config = { ...baseConfig, oauth: { github: true, google: false } };
    const only = await renderPage(<SignInOptions config={config} />, viewerOf(null));
    expect(only).not.toContain('data-slot="separator"');
    const both = { ...config, anonymous: true };
    const html = await renderPage(
      <SignInOptions config={both} to="//evil.example" />,
      viewerOf(null),
    );
    expect(html).toContain('data-slot="separator"');
    expect(html).not.toContain("evil.example");
  });
});

describe("board pieces", () => {
  it("renders vote buttons with aria-pressed and a descriptive label", async () => {
    const posts = fixtureListPosts({ limit: 2 }).items.map((p, i) => ({
      ...p,
      viewerHasVoted: i === 0,
    }));
    const html = await renderPage(<PostList posts={posts} />, viewerOf(accountUser));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Remove your vote from");
    expect(html).toContain("Vote for");
    expect(html).toContain('href="/posts/');
  });

  it("marks the active filter and exposes it to assistive tech", async () => {
    const html = await renderPage(
      <FilterPanel category="bug" status="planned" onCategory={() => {}} onStatus={() => {}} />,
      viewerOf(null),
    );
    const pressed = [...html.matchAll(/aria-pressed="true"[^>]*>(?:<svg.*?<\/svg>)?([^<]+)</g)].map(
      (m) => m[1],
    );
    expect(pressed).toEqual(["Bug report", "Planned"]);
  });
});
