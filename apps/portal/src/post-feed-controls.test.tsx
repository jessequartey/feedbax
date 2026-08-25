// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BoardNavigation,
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
});

describe("Post feed controls", () => {
  it("switches sort from visible tabs immediately", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"sort":"new"',
    );
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
