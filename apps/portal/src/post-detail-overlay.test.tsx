// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";

import { PostDetailOverlay } from "./post-detail-overlay";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("masks a Post detail over its originating route and Back restores that route", async () => {
  const history = createMemoryHistory({ initialEntries: ["/?query=search"] });
  const router = createTestRouter(history);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const origin = await screen.findByRole("link", { name: "Open Post" });
  origin.focus();
  fireEvent.click(origin);

  expect(
    await screen.findByRole("dialog", { name: "Post details" }),
  ).toBeTruthy();
  expect(document.body.textContent).toContain("Feed remains visible");
  expect(history.location.pathname).toBe("/p/masked-post");

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await vi.waitFor(() => expect(history.location.pathname).toBe("/"));
  expect(history.location.search).toBe("?query=search");
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(origin));
});

it("uses a Drawer on mobile and follows browser Back and Forward history", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 720px)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const history = createMemoryHistory({ initialEntries: ["/?query=search"] });
  const router = createTestRouter(history);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("link", { name: "Open Post" }));

  const drawer = await screen.findByRole("dialog", { name: "Post details" });
  expect(drawer.closest('[data-slot="drawer-popup"]')).toBeTruthy();
  history.back();
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(history.location.search).toBe("?query=search");

  history.forward();
  expect(
    await screen.findByRole("dialog", { name: "Post details" }),
  ).toBeTruthy();
  expect(history.location.pathname).toBe("/p/masked-post");
});

function createTestRouter(history: ReturnType<typeof createMemoryHistory>) {
  const root = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <PostDetailOverlay renderDetail={(slug) => <article>{slug}</article>} />
      </>
    ),
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <main>
        Feed remains visible
        <Link
          to="."
          state={{ postDetailOverlay: { slug: "masked-post" } }}
          mask={{
            to: "/p/$slug",
            params: { slug: "masked-post" },
            unmaskOnReload: true,
          }}
        >
          Open Post
        </Link>
      </main>
    ),
  });
  const post = createRoute({
    getParentRoute: () => root,
    path: "/p/$slug",
    component: () => <main>Full page</main>,
  });
  return createRouter({ history, routeTree: root.addChildren([index, post]) });
}
