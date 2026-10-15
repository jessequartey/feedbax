import { Toaster } from "@feedbax/ui/components/sonner";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";

import Header from "../components/header";
import { PortalFooter } from "../components/portal-footer";
import { LazyPostDetailOverlay as PostDetailOverlay } from "../lazy-post-detail-overlay";
import { DeviceProfileProvider } from "../components/device-profile-provider";
import {
  CommandPaletteProvider,
  useCommandPalette,
} from "../components/command-palette-context";
import feedbax from "../feedbax";
import { createPortalHead } from "../portal-head";

import appCss from "../index.css?url";

const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )
  : null;

const CommandPalette = lazy(() =>
  import("../components/command-palette").then((module) => ({
    default: module.CommandPalette,
  })),
);
const CreatePostOverlay = lazy(() =>
  import("../lazy-create-post-overlay").then((module) => ({
    default: module.LazyCreatePostOverlay,
  })),
);

export type RouterAppContext = {
  queryClient: import("@tanstack/react-query").QueryClient;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => createPortalHead(feedbax.product, appCss),

  component: RootDocument,
});

function OptionalPortalSurfaces() {
  const { open: commandPaletteOpen } = useCommandPalette();
  const overlayState = useRouterState({
    select: (state) => state.location.state,
  });

  return (
    <Suspense fallback={null}>
      {overlayState.createPostOverlay ? <CreatePostOverlay /> : null}
      {overlayState.postDetailOverlay ? <PostDetailOverlay /> : null}
      {commandPaletteOpen ? (
        <CommandPalette
          searchPosts={async (term) => {
            const { getPublicPostPage } =
              await import("../public-feedback-server-function");
            return getPublicPostPage({
              data: { search: term || undefined },
            });
          }}
        />
      ) : null}
    </Suspense>
  );
}

function RootDocument() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <DeviceProfileProvider>
              <CommandPaletteProvider>
                <div className="portal-shell">
                  <Header />
                  <div id="main-content" tabIndex={-1}>
                    <Outlet />
                  </div>
                  <PortalFooter />
                  <OptionalPortalSurfaces />
                </div>
              </CommandPaletteProvider>
            </DeviceProfileProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Toaster richColors />
        {RouterDevtools ? (
          <Suspense fallback={null}>
            <RouterDevtools position="bottom-left" />
          </Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
