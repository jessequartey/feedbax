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
import { CreatePostOverlay } from "../create-post-overlay";
import { RoutedPostCreationForm } from "../routed-post-creation-form";

import appCss from "../index.css?url";

export type RouterAppContext = {
  queryClient: import("@tanstack/react-query").QueryClient;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Feedbax",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

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
            <div className="portal-shell">
              <Header />
              <Outlet />
              <CreatePostOverlay
                renderForm={(close) => (
                  <RoutedPostCreationForm display="overlay" onCancel={close} />
                )}
              />
            </div>
          </ThemeProvider>
        </QueryClientProvider>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
