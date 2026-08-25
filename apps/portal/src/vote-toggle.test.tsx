// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoteToggle } from "./vote-toggle";

const post = {
  slug: "keyboard-navigation",
  title: "Keyboard navigation",
  description: "Navigate without a mouse.",
  type: "Feature Request" as const,
  status: "Planned" as const,
  voteCount: 2,
  createdAt: new Date("2026-08-25T00:00:00.000Z"),
  updatedAt: new Date("2026-08-25T00:00:00.000Z"),
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.turnstile;
  sessionStorage.clear();
});

describe("Vote toggle", () => {
  it("renders and resets an explicit Turnstile challenge after verification failure", async () => {
    const reset = vi.fn();
    window.turnstile = { render: vi.fn().mockReturnValue("widget-1"), reset };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "Vote verification failed.", code: "verification_failed" },
        { status: 400 },
      ),
    );
    render(<VoteToggle post={post} turnstileSiteKey="public-site-key" />);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Add Vote, 2 Votes" }));

    await waitFor(() => expect(reset).toHaveBeenCalledWith("widget-1"));
    expect(screen.getByRole("alert").textContent).toContain(
      "verification failed",
    );
  });

  it("rolls back and gives retry guidance when a Vote times out", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    render(<VoteToggle post={post} requestTimeoutMs={25} />);
    const button = screen.getByRole("button", { name: "Add Vote, 2 Votes" });
    fireEvent.click(button);
    expect(button.textContent).toContain("3");

    await act(async () => vi.advanceTimersByTime(25));

    expect(button.textContent).toContain("2");
    expect(screen.getByRole("alert").textContent).toContain(
      "Check your connection and try again",
    );
  });
});
