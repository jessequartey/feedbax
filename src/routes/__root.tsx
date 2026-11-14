import * as React from "react";
import { HeadContent, Outlet, Scripts, createRootRoute, useRouter } from "@tanstack/react-router";

import { FEEDBAX_DESCRIPTION } from "@/contracts/brand";
import { ErrorState, NotFoundState } from "@/components/portal/states";
import { themeInitScript } from "@/components/portal/theme";
import { socialBuild, socialMeta } from "@/lib/social-meta";
import appCss from "../styles.css?url";
// Latin covers the shell. Other subsets stay in CSS and download only if the text needs them.
import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

export const Route = createRootRoute({
  pendingComponent: RootPending,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: socialBuild()?.name || "Feedbax" },
      { name: "description", content: FEEDBAX_DESCRIPTION },
      // Open Graph and X cards. Crawlers read the static shell, so these are fixed at build time.
      ...socialMeta(FEEDBAX_DESCRIPTION, socialBuild()),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preload",
        href: geistLatin,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      // The header's F mark; /favicon.ico redirects here (public/_redirects).
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      // Feed readers and browsers discover the changelog from any page.
      { rel: "alternate", type: "application/rss+xml", title: "Changelog", href: "/changelog.rss" },
    ],
  }),
  shellComponent: RootDocument,
  component: Outlet,
  errorComponent: RootError,
  notFoundComponent: () => <NotFoundState />,
});

// The document shell renders before any viewer/config/data request has completed.
export function RootPending() {
  return (
    <div role="status" className="px-4 py-16 text-center text-sm text-muted-foreground">
      Loading feedback…
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script sets the theme class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Errors must render without a viewer or any portal providers.
function RootError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <ErrorState
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}
