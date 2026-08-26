// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BoardNavigation,
  MobilePostFilters,
  PostFeedControls,
  StatusNavigation,
} from "./post-feed-controls";
import {
  CommandPalette,
  CommandPaletteProvider,
} from "./components/command-palette";
import type { PublicPostQuery } from "@feedbax/feedback";

beforeEach(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = function () {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Post feed controls", () => {
  it("opens the mobile filters sheet with every Board and Post Status", async () => {
    render(<MobileFiltersHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const sheet = await screen.findByRole("dialog", {
      name: "Filter Posts",
    });
    expect(
      screen.getByRole("navigation", { name: "Mobile Boards" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Mobile Status filters" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "All posts" })).toBeTruthy();
    for (const status of [
      "New",
      "Reviewing",
      "Planned",
      "In progress",
      "Shipped",
      "Closed",
    ]) {
      expect(screen.getByRole("button", { name: status })).toBeTruthy();
    }
    expect(sheet).toBeTruthy();
  });

  it("applies mobile Board and Post Status selections to route query state", async () => {
    render(<MobileFiltersHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    await screen.findByRole("dialog", { name: "Filter Posts" });

    fireEvent.click(screen.getByRole("button", { name: "Feature requests" }));
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));

    expect(screen.getByTestId("route-state").textContent).toContain(
      '"types":["Feature Request"]',
    );
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"statuses":["New","Closed"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"statuses":["Closed"]',
    );
  });

  it("switches sort from visible tabs immediately", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"sort":"new"',
    );
  });

  it("exposes the mobile sort, create, search, and filter controls in tap order", async () => {
    stubViewport(true);
    render(<Harness />);

    const controls = screen.getByRole("group", {
      name: "Post feed controls",
    });
    await screen.findByRole("button", { name: "Filters" });
    expect(
      within(controls)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Trending", "Top", "New", "New post", "Search", "Filters"]);
  });

  it("keeps the mobile Filters control out of the desktop breakpoint", () => {
    stubViewport(false);
    render(<Harness />);

    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
  });

  it("opens the command palette from the Search button", async () => {
    render(<Harness withPalette />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("selects one Board at a time and reselecting it returns to All posts", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Feature requests" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"types":["Feature Request"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "Bug reports" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"types":["Bug Report"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "Bug reports" }));
    expect(screen.getByTestId("route-state").textContent).not.toContain(
      '"types"',
    );
    expect(
      screen
        .getByRole("button", { name: "All posts" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("combines and toggles roadmap Post Status filters", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Planned" }));
    fireEvent.click(screen.getByRole("button", { name: "Shipped" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"statuses":["Planned","Shipped"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "Planned" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"statuses":["Shipped"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "Shipped" }));
    expect(screen.getByTestId("route-state").textContent).not.toContain(
      '"statuses"',
    );
  });

  it("announces route updates locally from the feed controls", () => {
    render(<Harness pending />);

    expect(
      screen
        .getByRole("group", { name: "Post feed controls" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByText("Updating Posts…").className).toBe("sr-only");
  });
});

function MobileFiltersHarness() {
  const [search, setSearch] = useState<PublicPostQuery>({ sort: "trending" });
  return (
    <>
      <MobilePostFilters search={search} onSearchChange={setSearch} />
      <output data-testid="route-state">{JSON.stringify(search)}</output>
    </>
  );
}

function stubViewport(mobile: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: mobile && query === "(max-width: 1023px)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function Harness({
  pending = false,
  withPalette = false,
}: {
  pending?: boolean;
  withPalette?: boolean;
} = {}) {
  const [search, setSearch] = useState<PublicPostQuery>({
    sort: "trending",
  });
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CommandPaletteProvider>
        <PostFeedControls
          search={search}
          pending={pending}
          onSearchChange={(next) => setSearch(next)}
        />
        <BoardNavigation search={search} onSearchChange={setSearch} />
        <StatusNavigation search={search} onSearchChange={setSearch} />
        {withPalette ? (
          <CommandPalette
            searchPosts={async () => ({ items: [], nextCursor: undefined })}
          />
        ) : null}
      </CommandPaletteProvider>
      <output data-testid="route-state">{JSON.stringify(search)}</output>
    </QueryClientProvider>
  );
}
