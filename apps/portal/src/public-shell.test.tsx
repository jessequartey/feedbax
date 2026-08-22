// @vitest-environment jsdom

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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Header from "./components/header";
import { deviceProfileKey } from "./browser-post-state";
import { Changelog } from "./routes/changelog";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

beforeEach(() => {
  localStorage.clear();
  setTheme.mockClear();
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

  it("keeps theme selection in mobile navigation until a Device Profile exists", async () => {
    const { unmount } = renderShell("/");

    expect(screen.queryByRole("combobox", { name: "Theme" })).toBeNull();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open navigation" }),
    );
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
      target: { value: "dark" },
    });
    expect(setTheme).toHaveBeenCalledWith("dark");

    unmount();
    localStorage.setItem(deviceProfileKey, JSON.stringify({ name: "Ama" }));
    renderShell("/");
    await waitFor(() => expect(screen.getByText("A")).toBeTruthy());
    fireEvent.click(screen.getByText("A"));
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeTruthy();
  });

  it("renders Changelog as a complete coming-soon destination", async () => {
    renderShell("/changelog");

    expect(
      await screen.findByRole("heading", { name: "Changelog is coming soon" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View roadmap" }).getAttribute("href"),
    ).toBe("/roadmap");
  });
});

function renderShell(initialEntry: string) {
  const root = createRootRoute({
    component: () => (
      <>
        <Header />
        <Outlet />
      </>
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
    component: () => <main>Roadmap page</main>,
  });
  const changelog = createRoute({
    getParentRoute: () => root,
    path: "/changelog",
    component: Changelog,
  });
  const submit = createRoute({
    getParentRoute: () => root,
    path: "/submit",
    component: () => <main>Create Post</main>,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: root.addChildren([index, roadmap, changelog, submit]),
  });
  return render(<RouterProvider router={router} />);
}
