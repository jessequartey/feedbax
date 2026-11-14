import * as React from "react";
import { HeadContent, Outlet, Scripts, createRootRoute, useRouter } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { ErrorState, NotFoundState } from "@/components/portal/states";
import { SiteHeader } from "@/components/portal/site-header";
import { ThemeProvider, themeInitScript, useTheme } from "@/components/portal/theme";
import { ViewerProvider } from "@/components/portal/viewer";
import { getViewer } from "@/server/functions";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  // Who is signed in, and the public config. Refreshed after sign-in/out via router.invalidate().
  loader: () => getViewer(),
  staleTime: 60_000,
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: loaderData?.config.name ?? "Feedbax" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: () => <NotFoundState />,
});

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

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" />;
}

function RootComponent() {
  const viewer = Route.useLoaderData();
  return (
    <ThemeProvider>
      <ViewerProvider viewer={viewer}>
        <a
          href="#main-content"
          className="fixed top-3 left-3 z-[100] -translate-y-20 border bg-background px-4 py-3 text-sm font-medium transition-transform focus-visible:translate-y-0"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
        <ThemedToaster />
      </ViewerProvider>
    </ThemeProvider>
  );
}

// The viewer itself failed to load, so there is no header to show.
function RootError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <ThemeProvider>
      <ErrorState
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </ThemeProvider>
  );
}
