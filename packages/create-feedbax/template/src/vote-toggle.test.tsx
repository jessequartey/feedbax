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
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
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
  localStorage.clear();
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
  it("presents a caret in an interactive Vote control", () => {
    renderVoteToggle();

    const button = screen.getByRole("button", { name: "Add Vote, 2 Votes" });
    expect(button.classList.contains("vote-toggle-button")).toBe(true);
    expect(button.querySelector(".lucide-chevron-up")).not.toBeNull();
    expect(button.querySelector(".lucide-arrow-up")).toBeNull();
  });

  it("reconciles every affected browser projection only after confirmation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ voteCount: 3 }),
    );
    const queryClient = new QueryClient();
    const fetchPosts = vi.fn().mockResolvedValue({ items: [post] });
    const fetchRoadmap = vi
      .fn()
      .mockResolvedValue({ Planned: { items: [post] } });
    function VisibleProjections() {
      useQuery({
        queryKey: ["public-posts", { sort: "top" }],
        queryFn: fetchPosts,
        staleTime: Infinity,
      });
      useQuery({
        queryKey: ["public-post-roadmap"],
        queryFn: fetchRoadmap,
        staleTime: Infinity,
      });
      return null;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <VisibleProjections />
        <VoteToggle post={post} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(fetchPosts).toHaveBeenCalledOnce();
      expect(fetchRoadmap).toHaveBeenCalledOnce();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Vote, 2 Votes" }));

    await waitFor(() =>
      expect(localStorage.getItem("feedbax:voted-posts")).toContain(post.slug),
    );
    await waitFor(() => {
      expect(fetchPosts).toHaveBeenCalledTimes(2);
      expect(fetchRoadmap).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps mounted feed and Post detail toggles consistent after confirmation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ voteCount: 3 }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VoteToggle post={post} />
        <VoteToggle post={post} />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Vote, 2 Votes" })[0]!,
    );

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Remove Vote, 3 Votes" }),
      ).toHaveLength(2),
    );
  });

  it("renders and resets an explicit Turnstile challenge after verification failure", async () => {
    const reset = vi.fn();
    window.turnstile = { render: vi.fn().mockReturnValue("widget-1"), reset };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "Vote verification failed.", code: "verification_failed" },
        { status: 400 },
      ),
    );
    renderVoteToggle({ turnstileSiteKey: "public-site-key" });
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
    renderVoteToggle({ requestTimeoutMs: 25 });
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

function renderVoteToggle(
  props: Partial<React.ComponentProps<typeof VoteToggle>> = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VoteToggle post={post} {...props} />
    </QueryClientProvider>,
  );
}
