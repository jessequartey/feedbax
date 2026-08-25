// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";

import { ChangelogPage } from "./changelog-page";
import { CommandPaletteProvider } from "./components/command-palette";

afterEach(cleanup);

describe("Changelog page", () => {
  it("renders ordered updates with labels, anchors, media, and disabled following", async () => {
    const { container } = renderChangelog();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Changelog" }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Keyboard-first search",
      "Clearer roadmap filters",
      "More reliable draft recovery",
      "CSV export",
    ]);
    expect(
      [...container.querySelectorAll("time")].map((time) =>
        time.getAttribute("datetime"),
      ),
    ).toEqual(["2026-08-22", "2026-08-12", "2026-07-30", "2026-07-18"]);

    expect(screen.getAllByText("New feature")).toHaveLength(2);
    expect(screen.getByText("Improved")).toBeTruthy();
    expect(screen.getByText("Fixed")).toBeTruthy();
    expect(screen.getByText("Search Posts from any page")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /keyboard-first search palette/i }),
    ).toBeTruthy();

    expect(
      screen
        .getAllByRole("link", { name: /^Link to / })
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "#keyboard-first-search",
      "#clearer-roadmap-filters",
      "#reliable-draft-recovery",
      "#csv-export",
    ]);

    expect(screen.queryByRole("button", { name: "Follow updates" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Load more updates" }));

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Keyboard-first search",
      "Clearer roadmap filters",
      "More reliable draft recovery",
      "CSV export",
      "Roadmap progress at a glance",
      "Sharper search results",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Improvements" }));

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Clearer roadmap filters", "Roadmap progress at a glance"]);
    expect(
      screen
        .getByRole("button", { name: "Improvements" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("renders an update addressed by a direct anchor before loading more", async () => {
    renderChangelog("/changelog#sharper-search-results");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Sharper search results",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Load more updates" }),
    ).toBeNull();
  });
});

function renderChangelog(initialEntry = "/changelog") {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const root = createRootRoute({
    component: () => (
      <CommandPaletteProvider>
        <Outlet />
      </CommandPaletteProvider>
    ),
  });
  const changelog = createRoute({
    getParentRoute: () => root,
    path: "/changelog",
    component: ChangelogPage,
  });
  const router = createRouter({
    history,
    routeTree: root.addChildren([changelog]),
  });

  return render(<RouterProvider router={router} />);
}
