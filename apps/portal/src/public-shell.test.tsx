// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "next-themes";
import type { PublicPostPage } from "@feedbax/feedback";

import Header from "./components/header";
import {
  CommandPalette,
  CommandPaletteProvider,
} from "./components/command-palette";
import { ChangelogPage } from "./changelog-page";
import { deviceProfileKey, readDeviceProfile } from "./browser-post-state";
import { PublicRoadmapView } from "./public-roadmap-view";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      }) as MediaQueryList,
  });
});
afterEach(cleanup);

describe("public portal shell", () => {
  it("offers direct destinations and identifies the current destination", async () => {
    renderShell("/roadmap");

    const navigation = await screen.findByRole("navigation", {
      name: "Public portal",
    });
    expect(navigation.querySelector("[aria-current='page']")?.textContent).toBe(
      "Roadmap",
    );
    expect(
      screen.getByRole("link", { name: "Feedback" }).getAttribute("href"),
    ).toBe("/");
    expect(
      screen.getByRole("link", { name: "Changelog" }).getAttribute("href"),
    ).toBe("/changelog");
  });

  it("renders Changelog as a complete timeline destination", async () => {
    renderShell("/changelog");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Changelog" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Follow updates",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe("profile menu", () => {
  it("opens profile setup directly when no Device Profile exists", async () => {
    renderShell("/");

    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));

    expect(await screen.findByLabelText("Display name")).toBeTruthy();
    expect(
      screen.getByText(
        /Saved only on this device.*not sign-in.*cannot be recovered/i,
      ),
    ).toBeTruthy();
  });

  it("rejects an empty display name inline without saving", async () => {
    renderShell("/");

    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Save profile" }),
    );

    expect(await screen.findByText("Display name is required.")).toBeTruthy();
    expect(readDeviceProfile(localStorage)).toBeUndefined();
  });

  it("rejects an invalid email inline without saving", async () => {
    renderShell("/");

    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    fireEvent.change(await screen.findByLabelText("Display name"), {
      target: { value: "Ama Mensah" },
    });
    fireEvent.change(screen.getByLabelText("Email (optional)"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeTruthy();
    expect(readDeviceProfile(localStorage)).toBeUndefined();
  });

  it("saves a Device Profile and manages it from the profile menu", async () => {
    renderShell("/");

    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    fireEvent.change(await screen.findByLabelText("Display name"), {
      target: { value: "Ama Mensah" },
    });
    fireEvent.change(screen.getByLabelText("Email (optional)"), {
      target: { value: "ama@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(readDeviceProfile(localStorage)).toEqual({
        name: "Ama Mensah",
        email: "ama@example.com",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));

    expect(
      await screen.findByRole("menuitem", { name: "Clear profile" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear profile" }));

    await waitFor(() =>
      expect(readDeviceProfile(localStorage)).toBeUndefined(),
    );
    expect(await screen.findByRole("button", { name: "Profile" })).toBeTruthy();
  });

  it("keeps theme selection inside the configured profile menu", async () => {
    localStorage.setItem(deviceProfileKey, JSON.stringify({ name: "Ama" }));
    renderShell("/");

    await screen.findByText("Ama");
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });
});

describe("command palette", () => {
  it("opens with Cmd/Ctrl+K, closes on Escape, and restores focus", async () => {
    const { history } = renderShell("/");

    const feedbackLink = await screen.findByRole("link", {
      name: "Feedback",
    });
    feedbackLink.focus();
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(feedbackLink);
    expect(history.location.pathname).toBe("/");
  });

  it("searches Posts and opens the selected result", async () => {
    const { history } = renderShell("/roadmap", {
      searchPosts: async (term) =>
        term.toLowerCase().includes("keyboard")
          ? { items: [palettePost()], nextCursor: undefined }
          : { items: [], nextCursor: undefined },
    });

    await screen.findByRole("link", { name: "Feedback" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByPlaceholderText("Search feedback…"), {
      target: { value: "keyboard" },
    });

    const palette = await screen.findByRole("dialog");
    expect(
      await within(palette).findByText("Keyboard-first search"),
    ).toBeTruthy();
    expect(
      within(palette).getByText("Open search without reaching for the mouse."),
    ).toBeTruthy();
    expect(within(palette).getByText("Feature Request")).toBeTruthy();
    expect(within(palette).getByText("Planned")).toBeTruthy();
    fireEvent.keyDown(screen.getByPlaceholderText("Search feedback…"), {
      key: "Enter",
    });

    await waitFor(() =>
      expect(history.location.pathname).toBe("/p/keyboard-first-search"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    history.back();
    await waitFor(() => expect(history.location.pathname).toBe("/roadmap"));
  });

  it("shows an empty state when no Posts match", async () => {
    renderShell("/");

    await screen.findByRole("link", { name: "Feedback" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByPlaceholderText("Search feedback…"), {
      target: { value: "zzz-nothing" },
    });

    expect(await screen.findByText("No Posts match this search.")).toBeTruthy();
  });

  it("offers navigation actions including New post", async () => {
    const { history } = renderShell("/");

    await screen.findByRole("link", { name: "Feedback" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      await screen.findByRole("option", { name: "Feedback" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "Roadmap" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Changelog" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "New post" })).toBeTruthy();

    const input = screen.getByPlaceholderText("Search feedback…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(history.location.pathname).toBe("/roadmap"));

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const reopenedInput =
      await screen.findByPlaceholderText("Search feedback…");
    fireEvent.keyDown(reopenedInput, { key: "ArrowDown" });
    fireEvent.keyDown(reopenedInput, { key: "ArrowDown" });
    fireEvent.keyDown(reopenedInput, { key: "ArrowDown" });
    fireEvent.keyDown(reopenedInput, { key: "Enter" });

    await waitFor(() => expect(history.location.pathname).toBe("/submit"));
  });

  it("opens from the roadmap Search button", async () => {
    renderShell("/roadmap");

    fireEvent.click(await screen.findByRole("button", { name: "Search" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("opens from the Changelog Search button", async () => {
    renderShell("/changelog");

    fireEvent.click(await screen.findByRole("button", { name: "Search" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

function palettePost() {
  return {
    slug: "keyboard-first-search",
    title: "Keyboard-first search",
    description: "Open search without reaching for the mouse.",
    type: "Feature Request" as const,
    status: "Planned" as const,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
    updatedAt: new Date("2026-08-22T10:00:00.000Z"),
  };
}

function renderShell(
  initialEntry: string,
  {
    searchPosts,
  }: {
    searchPosts?: (term: string) => Promise<PublicPostPage>;
  } = {},
) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <CommandPaletteProvider>
            <Header />
            <Outlet />
            <CommandPalette
              searchPosts={
                searchPosts ??
                (async () => ({ items: [], nextCursor: undefined }))
              }
            />
          </CommandPaletteProvider>
        </ThemeProvider>
      </QueryClientProvider>
    ),
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <main>Feedback page</main>,
  });
  const roadmap = createRoute({
    getParentRoute: () => root,
    path: "/roadmap",
    component: () => (
      <PublicRoadmapView
        roadmap={{
          Planned: { items: [], totalCount: 0 },
          "In Progress": { items: [], totalCount: 0 },
          Shipped: { items: [], totalCount: 0 },
        }}
      />
    ),
  });
  const changelog = createRoute({
    getParentRoute: () => root,
    path: "/changelog",
    component: ChangelogPage,
  });
  const submit = createRoute({
    getParentRoute: () => root,
    path: "/submit",
    component: () => <main>Create Post</main>,
  });
  const post = createRoute({
    getParentRoute: () => root,
    path: "/p/$slug",
    component: () => <main>Post detail</main>,
  });
  const router = createRouter({
    history,
    routeTree: root.addChildren([index, roadmap, changelog, submit, post]),
  });
  render(<RouterProvider router={router} />);
  return { history };
}
