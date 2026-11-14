import * as React from "react";
import { HeadContent, Outlet, Scripts, createRootRoute, useRouter } from "@tanstack/react-router";

import { FEEDBAX_DESCRIPTION } from "@/contracts/brand";
import { ErrorState, NotFoundState } from "@/components/portal/states";
import { themeInitScript } from "@/components/portal/theme";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  pendingComponent: RootPending,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: "Feedbax" },
      { name: "description", content: FEEDBAX_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Feedbax" },
      { property: "og:description", content: FEEDBAX_DESCRIPTION },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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
