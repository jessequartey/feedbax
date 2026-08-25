// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import {
  CommandPalette,
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "./components/command-palette";
import Header from "./components/header";
import { PostFeedControls } from "./post-feed-controls";
import { PublicPostDetail } from "./public-post-detail";
import { publicPostSearch } from "./public-feedback-page";
import { ensureChangelogEnabled } from "./routes/changelog";

const votingDisabled = {
  voting: false,
  comments: true,
  changelog: true,
} as const;
const commentsDisabled = {
  voting: true,
  comments: false,
  changelog: true,
} as const;
const changelogDisabled = {
  voting: true,
  comments: true,
  changelog: false,
} as const;
const allDisabled = {
  voting: false,
  comments: false,
  changelog: false,
} as const;

afterEach(cleanup);

describe("disabled portal capabilities", () => {
  it("makes New the only accepted and visible feed ordering without voting", () => {
    expect(publicPostSearch({ sort: "top" }, votingDisabled).sort).toBe("new");
    render(
      <PostFeedControls features={votingDisabled} search={{ sort: "new" }} />,
    );
    expect(
      within(screen.getByRole("group", { name: "Sort Posts" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["New"]);
  });

  it("removes the complete Comment treatment independently", () => {
    render(
      <PublicPostDetail
        features={commentsDisabled}
        post={{
          slug: "plain-post",
          title: "Plain Post",
          description: "No unavailable capabilities are advertised.",
          type: "General Feedback",
          status: "New",
          createdAt: new Date("2026-08-25T00:00:00Z"),
          updatedAt: new Date("2026-08-25T00:00:00Z"),
        }}
      />,
    );
    expect(screen.queryByText(/comment/i)).toBeNull();
    expect(screen.getByLabelText(/score/i)).toBeTruthy();
  });

  it("removes score treatment independently", () => {
    render(
      <PublicPostDetail
        features={votingDisabled}
        post={{
          slug: "plain-post",
          title: "Plain Post",
          description: "Voting is not advertised.",
          type: "General Feedback",
          status: "New",
          createdAt: new Date("2026-08-25T00:00:00Z"),
          updatedAt: new Date("2026-08-25T00:00:00Z"),
        }}
      />,
    );
    expect(screen.queryByLabelText(/score/i)).toBeNull();
    expect(screen.getByRole("region", { name: "Comments" })).toBeTruthy();
  });

  it("removes Changelog from header and command navigation", async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <QueryClientProvider client={new QueryClient()}>
          <CommandPaletteProvider>
            <Header features={changelogDisabled} />
            <CommandPaletteTrigger />
            <CommandPalette
              features={changelogDisabled}
              searchPosts={async () => ({ items: [] })}
            />
          </CommandPaletteProvider>
        </QueryClientProvider>
      ),
    });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole("link", { name: "Changelog" })).toBeNull();
    screen.getByRole("button", { name: "Search" }).click();
    expect(screen.queryByText("Changelog")).toBeNull();
  });

  it("rejects the Changelog route when Changelog is disabled", () => {
    expect(() => ensureChangelogEnabled(changelogDisabled)).toThrow();
  });

  it("removes every unavailable promise in combination", () => {
    render(
      <PublicPostDetail
        features={allDisabled}
        post={{
          slug: "minimal-post",
          title: "Minimal Post",
          description: "Only feedback details remain.",
          type: "General Feedback",
          status: "New",
          createdAt: new Date("2026-08-25T00:00:00Z"),
          updatedAt: new Date("2026-08-25T00:00:00Z"),
        }}
      />,
    );
    expect(screen.queryByLabelText(/score|comment/i)).toBeNull();
    expect(screen.queryByText(/comment/i)).toBeNull();
  });
});
// @vitest-environment jsdom
