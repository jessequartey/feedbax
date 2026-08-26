import { Toaster } from "@feedbax/ui/components/sonner";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";

import Header from "../components/header";
import {
  CommandPalette,
  CommandPaletteProvider,
} from "../components/command-palette";
import { CreatePostOverlay } from "../create-post-overlay";
import { portalFeedbackMutations } from "../routed-post-creation-form";
import { PostDetailOverlay } from "../post-detail-overlay";
import { OverlayPostDetail } from "../overlay-post-detail";
import { getPublicPostPage } from "../public-feedback-server-function";
import feedbax from "../feedbax";
import { createPortalHead } from "../portal-head";

import appCss from "../index.css?url";

export type RouterAppContext = {
  queryClient: import("@tanstack/react-query").QueryClient;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => createPortalHead(feedbax.product, appCss),

  component: RootDocument,
});

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
            <CommandPaletteProvider>
              <div className="portal-shell">
                <Header />
                <div id="main-content" tabIndex={-1}>
                  <Outlet />
                </div>
                <CreatePostOverlay mutations={portalFeedbackMutations} />
                <PostDetailOverlay
                  renderDetail={(slug) => <OverlayPostDetail slug={slug} />}
                />
                <CommandPalette
                  searchPosts={(term) =>
                    getPublicPostPage({
                      data: { search: term || undefined },
                    })
                  }
                />
              </div>
            </CommandPaletteProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
