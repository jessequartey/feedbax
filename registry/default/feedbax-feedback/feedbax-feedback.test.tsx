// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbaxFeedback } from "./feedbax-feedback";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("confirms an asynchronous registry submission without reporting an event-reset error", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const onSubmit = vi.fn(async () => {
    await Promise.resolve();
    return { slug: "my-request", title: "My request" };
  });
  render(<FeedbaxFeedback onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  fireEvent.change(await screen.findByLabelText("Title"), {
    target: { value: "My request" },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Please add this capability." },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Send feedback" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Feedback sent: My request",
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
