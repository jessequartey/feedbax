import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <main className="mx-auto max-w-3xl px-6 py-24">
        <p className="eyebrow">404</p>
        <h1>That page is not in the manual.</h1>
        <a href="/docs">Return to documentation</a>
      </main>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
