// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { PostCreationFlow } from "./post-creation-flow";
import { authorizedDraftPostsQueryKey } from "./authorized-draft-query";
import { readCapabilities } from "./browser-post-state";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("routed Post creation", () => {
  it("retains authority, reconciles caches, and opens the authorized detail route", async () => {
    const created = {
      id: "post-1",
      slug: "keyboard-navigation",
      title: "Keyboard navigation",
      description: "Let Participants navigate without a pointer.",
      type: "Feature Request" as const,
      status: "New" as const,
      published: false,
      createdAt: new Date("2026-08-22T10:00:00.000Z"),
      updatedAt: new Date("2026-08-22T10:00:00.000Z"),
      browserCapability: "browser-capability" as never,
    };
    const mutations = {
      submitPost: vi.fn().mockResolvedValue(created),
      editDraftPost: vi.fn(),
      withdrawDraftPost: vi.fn(),
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(["public-posts", { sort: "trending" }], {
      pages: [],
    });
    const history = createMemoryHistory({ initialEntries: ["/submit"] });
    const router = createCreationRouter(history, mutations);

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("0 / 5,000 characters")).toBeTruthy();
    fireEvent.submit(
      screen.getByRole("button", { name: "Create Post" }).closest("form")!,
    );
    expect(await screen.findByText("Enter a title.")).toBeTruthy();
    expect(await screen.findByText("Enter a description.")).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: created.title },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: created.description },
    });
    expect(screen.getByText("44 / 5,000 characters")).toBeTruthy();
    fireEvent.submit(
      screen.getByRole("button", { name: "Create Post" }).closest("form")!,
    );

    expect(
      await screen.findByRole("heading", { name: "keyboard-navigation" }),
    ).toBeTruthy();
    expect(history.location.pathname).toBe("/p/keyboard-navigation");
    expect(window.localStorage.getItem("feedbax:post-capabilities")).toContain(
      "browser-capability",
    );
    expect(
      queryClient.getQueryData(
        authorizedDraftPostsQueryKey(readCapabilities(localStorage)),
      ),
    ).toEqual([
      expect.objectContaining({ id: "post-1", slug: "keyboard-navigation" }),
    ]);
    expect(
      queryClient.getQueryState(["public-posts", { sort: "trending" }])
        ?.isInvalidated,
    ).toBe(true);
  });
});

function createCreationRouter(
  history: ReturnType<typeof createMemoryHistory>,
  mutations: ComponentProps<typeof PostCreationFlow>["mutations"],
) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const submit = createRoute({
    getParentRoute: () => root,
    path: "/submit",
    component: () => <PostCreationFlow mutations={mutations} />,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/p/$slug",
    component: function Detail() {
      const { slug } = detail.useParams();
      return <h1>{slug}</h1>;
    },
  });
  return createRouter({
    history,
    routeTree: root.addChildren([submit, detail]),
  });
}
