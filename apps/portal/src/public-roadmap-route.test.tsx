// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RouterAppContext } from "./routes/__root";
import { createPublicRoadmapRoute } from "./public-roadmap-route";
import { PublicRoadmapView } from "./public-roadmap-view";

afterEach(cleanup);

describe("/roadmap route", () => {
  it("hydrates once, renders ordered groups, and navigates cards canonically", async () => {
    const queryClient = new QueryClient();
    const fetchRoadmap = vi.fn(async () => ({
      Planned: {
        items: [post("planned-post", "Planned")],
        totalCount: 1,
      },
      "In Progress": {
        items: [post("building-post", "In Progress")],
        totalCount: 1,
      },
      Shipped: { items: [], totalCount: 0 },
    }));
    const history = createMemoryHistory({ initialEntries: ["/roadmap"] });
    const root = createRootRouteWithContext<RouterAppContext>()({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      ),
    });
    const roadmap = createPublicRoadmapRoute({ fetchRoadmap }).update({
      id: "/roadmap",
      path: "/roadmap",
      getParentRoute: () => root,
    } as never);
    const postDetail = createRoute({
      getParentRoute: () => root,
      path: "/p/$slug",
      component: () => <div>Post detail</div>,
    });
    const router = createRouter({
      context: { queryClient },
      history,
      routeTree: root.addChildren([roadmap, postDetail]),
    });

    render(<RouterProvider router={router} />);

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Planned",
      "In progress",
      "Shipped",
    ]);
    expect(fetchRoadmap).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("link", { name: /planned-post/i }));

    await waitFor(() =>
      expect(history.location.pathname).toBe("/p/planned-post"),
    );
  });

  it("appends the next page in one column and removes its button on exhaustion", async () => {
    const queryClient = new QueryClient();
    const fetchRoadmap = vi.fn(async () => ({
      Planned: {
        items: [post("planned-page-1", "Planned")],
        nextCursor: "planned-cursor",
        totalCount: 2,
      },
      "In Progress": { items: [], totalCount: 0 },
      Shipped: { items: [], totalCount: 0 },
    }));
    let resolveNextPage!: (page: {
      items: ReturnType<typeof post>[];
      totalCount: number;
    }) => void;
    const fetchRoadmapStatusPage = vi.fn(
      () =>
        new Promise<{
          items: ReturnType<typeof post>[];
          totalCount: number;
        }>((resolve) => {
          resolveNextPage = resolve;
        }),
    );
    const history = createMemoryHistory({ initialEntries: ["/roadmap"] });
    const root = createRootRouteWithContext<RouterAppContext>()({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      ),
    });
    const roadmap = createPublicRoadmapRoute({
      fetchRoadmap,
      fetchRoadmapStatusPage,
    }).update({
      id: "/roadmap",
      path: "/roadmap",
      getParentRoute: () => root,
    } as never);
    const router = createRouter({
      context: { queryClient },
      history,
      routeTree: root.addChildren([roadmap]),
    });

    render(<RouterProvider router={router} />);

    const loadMore = await screen.findByRole("button", {
      name: "Load more Planned Posts",
    });
    fireEvent.click(loadMore);

    expect(fetchRoadmapStatusPage).toHaveBeenCalledWith({
      status: "Planned",
      cursor: "planned-cursor",
    });
    expect(loadMore.textContent).toContain("Loading");
    expect((loadMore as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole("status", { name: "Roadmap status" }).textContent,
    ).toBe("Loading more Planned Posts.");

    resolveNextPage({
      items: [post("planned-page-2", "Planned")],
      totalCount: 2,
    });

    expect(
      await screen.findByRole("link", { name: /planned-page-2/i }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more Planned Posts" }),
      ).toBeNull(),
    );
    expect(
      screen.getByText("2", { selector: "[data-roadmap-count]" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Roadmap status" }).textContent,
    ).toBe("1 more Planned Post loaded.");
  });

  it("shows one status column at a time behind mobile status tabs", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    render(
      <PublicRoadmapView
        roadmap={{
          Planned: {
            items: [post("planned-mobile", "Planned")],
            totalCount: 1,
          },
          "In Progress": { items: [], totalCount: 0 },
          Shipped: {
            items: [
              {
                ...post("shipped-mobile", "Planned"),
                status: "Shipped",
              },
            ],
            totalCount: 1,
          },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /planned-mobile/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /shipped-mobile/i })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Shipped 1/i }));

    expect(
      await screen.findByRole("link", { name: /shipped-mobile/i }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /planned-mobile/i })).toBeNull();
  });
});

function post(slug: string, status: "Planned" | "In Progress") {
  return {
    slug,
    title: slug,
    description: `${slug} description`,
    type: "Feature Request" as const,
    status,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
    updatedAt: new Date("2026-08-22T10:00:00.000Z"),
  };
}
