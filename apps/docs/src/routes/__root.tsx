import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Feedbax — Feedback in Notion, on your terms" },
      {
        name: "description",
        content:
          "An open-source feedback portal for product teams that work in Notion.",
      },
      { property: "og:title", content: "Feedbax" },
      {
        property: "og:description",
        content: "Feedback in Notion, on your terms.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://feedbax.dev" },
      { property: "og:image", content: "https://feedbax.dev/og.svg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/feedbax-mark.svg" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <RootProvider
          theme={{ enabled: true, defaultTheme: "system", enableSystem: true }}
        >
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
