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
import type { PublicFeedbackQuery } from "@feedbax/feedback";

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
});

function Harness() {
  const [search, setSearch] = useState<PublicFeedbackQuery>({
    sort: "trending",
    types: [],
    statuses: [],
  });
  return (
    <>
      <PostFeedControls
        search={search}
        onSearchChange={(next) => setSearch(next)}
      />
      <output data-testid="route-state">{JSON.stringify(search)}</output>
    </>
  );
}
