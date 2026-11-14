import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { ShowcaseCard } from "@/components/portal/showcase-card";
import { SiteHeader } from "@/components/portal/site-header";
import { ThemeProvider, useTheme } from "@/components/portal/theme";
import { ViewerProvider } from "@/components/portal/viewer";
import { pageTitle } from "@/components/portal/route-head";
import { getViewer } from "@/server/functions";
import { RootPending } from "./__root";

export const Route = createFileRoute("/_portal")({
  ssr: false,
  pendingComponent: RootPending,
  // Refreshed after sign-in/out via router.invalidate(); never run in the shell build.
  loader: () => getViewer(),
  staleTime: 60_000,
  head: ({ matches }) => pageTitle(matches),
  component: PortalLayout,
});

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" />;
}

function PortalLayout() {
  const viewer = Route.useLoaderData();
  return (
    <ThemeProvider>
      <ViewerProvider viewer={viewer}>
        <a
          href="#main-content"
          className="fixed top-3 left-3 z-[100] -translate-y-24 border bg-background px-4 py-3 text-sm font-medium focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="scroll-mt-20 outline-none">
          <Outlet />
        </main>
        <ShowcaseCard />
        <ThemedToaster />
      </ViewerProvider>
    </ThemeProvider>
  );
}
