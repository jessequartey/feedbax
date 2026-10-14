// @vitest-environment jsdom
import type { ChangelogPage as PageData } from "@feedbax/changelog";
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
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangelogPage } from "./changelog-page";
import { CommandPaletteProvider } from "./components/command-palette";

afterEach(cleanup);

describe("Changelog page", () => {
  it("renders loader data, filters by Label, and loads the next cursor", async () => {
    const loadPage = vi.fn().mockImplementation(async ({ cursor, label }) => {
      if (label === "Fixed") return page([entry("fixed", "Fixed")]);
      if (cursor === "next") return page([entry("older", "Improved")]);
      return page([]);
    });
    renderChangelog({
      initialPage: page([entry("new", "Improved")], "next"),
      loadPage,
    });

    expect(
      await screen.findByRole("heading", { level: 2, name: "new" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more updates" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "older" }),
    ).toBeTruthy();
    expect(loadPage).toHaveBeenCalledWith({ cursor: "next" });

    fireEvent.click(screen.getByRole("button", { name: "Improved" }));
    await waitFor(() =>
      expect(loadPage).toHaveBeenCalledWith({ label: "Improved" }),
    );
  });

  it("preserves hash links and renders rich-text properties without page-body reads", async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValue(page([entry("anchored", "Fixed")]));
    const { container } = renderChangelog({
      initialPage: page([entry("first", "Improved")], "next"),
      loadPage,
      initialEntry: "/changelog#anchored",
    });
    expect(await screen.findByText("Body anchored")).toBeTruthy();
    expect(loadPage).toHaveBeenCalledWith({ cursor: "next" });
    expect(
      screen
        .getByRole("link", { name: "Link to anchored" })
        .getAttribute("href"),
    ).toBe("#anchored");
    expect(container.querySelector("article#anchored")).toBeTruthy();
  });

  it("renders an accessible image and preserves text when an image is absent or expired", async () => {
    const valid = entry("illustrated", "Improved");
    valid.image = {
      src: "https://files.notion.example/illustrated.png",
      alt: "Illustrated image",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const expired = entry("expired", "Fixed");
    expired.image = {
      src: "https://files.notion.example/expired.png",
      alt: "Expired image",
      expiresAt: new Date(Date.now() - 1),
    };

    renderChangelog({ initialPage: page([valid, expired]), loadPage: vi.fn() });

    expect(
      await screen.findByRole("img", { name: "Illustrated image" }),
    ).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Expired image" })).toBeNull();
    expect(screen.getByText("Body expired")).toBeTruthy();
  });
});

function renderChangelog({
  initialPage,
  loadPage,
  initialEntry = "/changelog",
}: {
  initialPage: PageData;
  loadPage: (input: { cursor?: string; label?: string }) => Promise<PageData>;
  initialEntry?: string;
}) {
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
    component: () => (
      <ChangelogPage initialPage={initialPage} loadPage={loadPage} />
    ),
  });
  const router = createRouter({
    history,
    routeTree: root.addChildren([changelog]),
  });
  return render(<RouterProvider router={router} />);
}

function page(items: PageData["items"], nextCursor?: string): PageData {
  return { items, ...(nextCursor ? { nextCursor } : {}) };
}

function entry(slug: string, label: string): PageData["items"][number] {
  return {
    slug,
    date: "2026-08-01",
    title: slug,
    summary: `Summary ${slug}`,
    body: `Body ${slug}`,
    labels: [label],
    updatedAt: new Date("2026-08-01T00:00:00Z"),
  };
}
