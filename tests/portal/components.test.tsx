import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { SignInOptions } from "../../src/components/portal/sign-in-options.tsx";
import { PostList } from "../../src/components/portal/post-row.tsx";
import { primaryNav, SiteHeader } from "../../src/components/portal/site-header.tsx";
import { FilterPanel } from "../../src/components/portal/filter-panel.tsx";
import { accountUser, anonymousUser, fixtureListPosts, hostUser } from "../fixtures/portal.ts";
import { baseConfig, renderPage, viewerOf } from "./helpers.tsx";

const headerSource = readFileSync(
  new URL("../../src/components/portal/site-header.tsx", import.meta.url),
  "utf8",
);

function mainNavs(html: string): string[] {
  return [...html.matchAll(/<nav aria-label="Main"[^>]*>[\s\S]*?<\/nav>/g)].map(
    (match) => match[0],
  );
}

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

  it("shows the product name, its initial and the Changelog link", async () => {
    const html = await renderPage(<SiteHeader />, viewerOf(null, { name: "Acme Feedback" }));
    expect(html).toContain("Acme Feedback");
    expect(html).toContain(">A<");
    for (const label of ["Feedback", "Roadmap", "Changelog"]) expect(html).toContain(label);
    expect(html).toContain('href="/changelog"');
    for (const nav of mainNavs(html)) {
      expect(nav).not.toContain("My feedback");
      expect(nav).not.toContain('href="/my-feedback"');
    }
  });

  it("hides My feedback from the primary nav while Changelog is shown, and keeps the account link", async () => {
    const withChangelog = [
      { to: "/", label: "Feedback" },
      { to: "/changelog", label: "Changelog" },
      { to: "/my-feedback", label: "My feedback" },
    ];
    expect(primaryNav(withChangelog).map((item) => item.to)).toEqual(["/", "/changelog"]);
    expect(
      primaryNav(withChangelog.filter((item) => item.to !== "/changelog")).map((item) => item.to),
    ).toEqual(["/", "/my-feedback"]);

    const html = await renderPage(<SiteHeader />, viewerOf(accountUser));
    const navs = mainNavs(html);
    expect(navs.length).toBeGreaterThan(0);
    for (const nav of navs) {
      expect(nav).toContain('href="/changelog"');
      expect(nav).not.toContain("My feedback");
      expect(nav).not.toContain('href="/my-feedback"');
    }
    // Menu and sheet contents portal to document.body, which this node render omits.
    // The dropdown item stays the desktop path; the sheet footer is the mobile path.
    expect(headerSource).toContain(
      '<DropdownMenuItem render={<Link to="/my-feedback" />}>My feedback</DropdownMenuItem>',
    );
    const mobileMenu = headerSource.slice(
      headerSource.indexOf("function MobileMenu"),
      headerSource.indexOf("export function SiteHeader"),
    );
    const mobileNav = mobileMenu.slice(mobileMenu.indexOf("<nav"), mobileMenu.indexOf("</nav>"));
    const mobileFooter = mobileMenu.slice(mobileMenu.indexOf("</nav>"));
    expect(mobileNav).not.toContain("my-feedback");
    expect(mobileFooter).toContain("myFeedbackItem.to");
    expect(mobileFooter).toContain("{myFeedbackItem.label}");

    const onPage = await renderPage(<SiteHeader />, viewerOf(accountUser), "/my-feedback");
    expect(mainNavs(onPage).join("")).not.toContain('aria-current="page"');
  });

  it("keeps email settings in the account menu and the mobile menu, not the closed header", async () => {
    const source = readFileSync(
      new URL("../../src/components/portal/site-header.tsx", import.meta.url),
      "utf8",
    );
    expect(source.match(/to="\/notifications"/g)).toHaveLength(2);
    expect(source).toContain('config.email && user.kind !== "anonymous"');
    expect(source).toContain('config.email && user && user.kind !== "anonymous"');
    // Closed menus are not in the server HTML, so the link stays out of the first paint.
    for (const viewer of [
      viewerOf(accountUser),
      viewerOf(accountUser, { ...baseConfig, email: true }),
      viewerOf(anonymousUser, { ...baseConfig, email: true }),
    ]) {
      expect(await renderPage(<SiteHeader />, viewer)).not.toContain('href="/notifications"');
    }
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
