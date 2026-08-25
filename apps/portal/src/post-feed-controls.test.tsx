// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostFeedControls } from "./post-feed-controls";
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
  it("switches sort immediately", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Sort"), {
      target: { value: "new" },
    });
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"sort":"new"',
    );
  });

  it("opens the command palette from the Search button", async () => {
    render(<Harness withPalette />);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("stages multi-select filters until Apply and clears them together", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Bug Report" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Planned" }));
    expect(screen.getByTestId("route-state").textContent).not.toContain(
      "Planned",
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"types":["Bug Report"]',
    );
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"statuses":["Planned"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"types":[]',
    );
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"statuses":[]',
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
    types: [],
    statuses: [],
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
