// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostFeedControls } from "./post-feed-controls";
import type { PublicPostQuery } from "@feedbax/feedback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Post feed controls", () => {
  it("switches sort immediately and debounces URL-backed search", async () => {
    vi.useFakeTimers();
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Sort"), {
      target: { value: "new" },
    });
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"sort":"new"',
    );

    expect(screen.queryByPlaceholderText("Search Posts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show search" }));
    fireEvent.change(screen.getByPlaceholderText("Search Posts"), {
      target: { value: "keyboard" },
    });
    expect(screen.getByTestId("route-state").textContent).not.toContain(
      "keyboard",
    );
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByTestId("route-state").textContent).toContain(
      '"search":"keyboard"',
    );
  });

  it("stages multi-select filters until Apply and clears them together", () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Bug Report"));
    fireEvent.click(screen.getByLabelText("Planned"));
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

  it("moves keyboard focus into search when search is revealed", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Show search" }));

    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "Search Posts" }),
    );
  });

  it("does not steal restored focus when URL search is already expanded", () => {
    const origin = document.createElement("button");
    document.body.append(origin);
    origin.focus();

    render(<Harness initialSearch="restored" />);

    expect(document.activeElement).toBe(origin);
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
  initialSearch,
  pending = false,
}: {
  initialSearch?: string;
  pending?: boolean;
} = {}) {
  const [search, setSearch] = useState<PublicPostQuery>({
    sort: "trending",
    types: [],
    statuses: [],
    ...(initialSearch ? { search: initialSearch } : {}),
  });
  return (
    <>
      <PostFeedControls
        search={search}
        pending={pending}
        onSearchChange={(next) => setSearch(next)}
      />
      <output data-testid="route-state">{JSON.stringify(search)}</output>
    </>
  );
}
