// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalFeedbackForm } from "./portal-feedback-form";

const mutations = {
  submitPost: vi.fn(),
  editDraft: vi.fn(),
  withdrawDraft: vi.fn(),
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Post creation form", () => {
  it("shows character feedback and field-level validation", () => {
    render(<PortalFeedbackForm mutations={mutations} />);

    expect(screen.getByText("0 / 5,000 characters")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A clearer empty state" },
    });
    expect(screen.getByText("21 / 5,000 characters")).toBeTruthy();

    fireEvent.submit(
      screen.getByRole("button", { name: "Create Post" }).closest("form")!,
    );

    expect(screen.getByText("Enter a title.")).toBeTruthy();
    expect(screen.queryByText("Enter a description.")).toBeNull();
  });

  it("offers Cancel in an overlay and delegates history restoration", () => {
    const cancel = vi.fn();
    render(
      <PortalFeedbackForm
        mutations={mutations}
        display="overlay"
        onCancel={cancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("retains the returned Browser Capability before navigating to the new Post", async () => {
    mutations.submitPost.mockResolvedValue({
      id: "post-1",
      slug: "keyboard-navigation",
      browserCapability: "browser-capability",
    } as never);
    const onCreated = vi.fn();
    render(<PortalFeedbackForm mutations={mutations} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Keyboard navigation" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Let Participants navigate without a pointer." },
    });

    fireEvent.submit(
      screen.getByRole("button", { name: "Create Post" }).closest("form")!,
    );

    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "keyboard-navigation" }),
      ),
    );
    expect(window.localStorage.getItem("feedbax:post-capabilities")).toContain(
      "browser-capability",
    );
  });
});
