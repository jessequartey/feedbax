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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "next-themes";

import Header from "./components/header";
import { deviceProfileKey, readDeviceProfile } from "./browser-post-state";
import { Changelog } from "./routes/changelog";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
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

    expect(
      await screen.findByText("Display name is required."),
    ).toBeTruthy();
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
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Dark" }),
    );

    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });
});

function renderShell(initialEntry: string) {
  const root = createRootRoute({
    component: () => (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Header />
        <Outlet />
      </ThemeProvider>
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
