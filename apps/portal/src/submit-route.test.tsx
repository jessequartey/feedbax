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
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatePostOverlay } from "./create-post-overlay";

const mutations = {
  submitPost: vi.fn(),
  editDraftPost: vi.fn(),
  withdrawDraftPost: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("/submit", () => {
  it("opens from the feed at the canonical URL without discarding the feed", async () => {
    const history = createMemoryHistory({ initialEntries: ["/"] });
    const router = createSubmitRouter(history);

    renderSubmitRouter(router);
    fireEvent.click(await screen.findByRole("link", { name: "Create Post" }));

    expect(
      await screen.findByRole("dialog", { name: "Create a Post" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Posts");
    expect(history.location.pathname).toBe("/submit");
  });

  it("renders a complete creation page when entered directly", async () => {
    const history = createMemoryHistory({ initialEntries: ["/submit"] });
    const router = createSubmitRouter(history);

    renderSubmitRouter(router);

    expect(await screen.findByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Create a Post" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses a Drawer on mobile and Back restores the feed route", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 720px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const history = createMemoryHistory({ initialEntries: ["/"] });
    const router = createSubmitRouter(history);

    renderSubmitRouter(router);
    fireEvent.click(await screen.findByRole("link", { name: "Create Post" }));

    const drawer = await screen.findByRole("dialog", { name: "Create a Post" });
    expect(drawer.closest('[data-slot="drawer-popup"]')).toBeTruthy();
    history.back();
    await vi.waitFor(() => expect(history.location.pathname).toBe("/"));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

function renderSubmitRouter(router: ReturnType<typeof createSubmitRouter>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function createSubmitRouter(history: ReturnType<typeof createMemoryHistory>) {
  const root = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <CreatePostOverlay mutations={mutations} />
      </>
    ),
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <main>
        <h1>Posts</h1>
        <Link
          to="/"
          state={{ createPostOverlay: true }}
          mask={{ to: "/submit", unmaskOnReload: true }}
        >
          Create Post
        </Link>
      </main>
    ),
  });
  const submit = createRoute({
    getParentRoute: () => root,
    path: "/submit",
    component: () => (
      <main>
        <h1>Create a Post</h1>
      </main>
    ),
  });

  return createRouter({
    history,
    routeTree: root.addChildren([index, submit]),
  });
}
