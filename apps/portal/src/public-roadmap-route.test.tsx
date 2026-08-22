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

afterEach(cleanup);

describe("/roadmap route", () => {
  it("hydrates once, renders ordered groups, and navigates cards canonically", async () => {
    const queryClient = new QueryClient();
    const fetchRoadmap = vi.fn(async () => ({
      Planned: [post("planned-post", "Planned")],
      "In Progress": [post("building-post", "In Progress")],
      Shipped: [],
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
