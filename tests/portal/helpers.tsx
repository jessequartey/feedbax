import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import type { PublicConfig } from "../../src/contracts/config.ts";
import type { ViewerUser } from "../../src/contracts/domain.ts";
import type { Viewer } from "../../src/contracts/portal.ts";
import { ViewerProvider } from "../../src/components/portal/viewer.tsx";

export const baseConfig: PublicConfig = {
  name: "Acme Feedback",
  appUrl: null,
  anonymous: false,
  categories: ["feature", "bug", "general"],
  hostLogin: false,
  showcase: false,
  oauth: { github: false, google: false },
};

export const viewerOf = (user: ViewerUser | null, config: Partial<PublicConfig> = {}): Viewer => ({
  user,
  config: { ...baseConfig, ...config },
});

/** Server-renders `ui` inside a real router and the viewer context. */
export async function renderPage(ui: React.ReactNode, viewer: Viewer, path = "/"): Promise<string> {
  const root = createRootRoute({
    component: () => <ViewerProvider viewer={viewer}>{ui}</ViewerProvider>,
  });
  const paths = ["/", "/roadmap", "/my-feedback", "/login", "/signup", "/submit"];
  const children = paths.map((p) => createRoute({ getParentRoute: () => root, path: p }));
  const router = createRouter({
    routeTree: root.addChildren(children),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  // React separates adjacent text nodes with <!-- --> in server output.
  return renderToString(<RouterProvider router={router} />).replaceAll("<!-- -->", "");
}
