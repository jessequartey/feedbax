// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deviceProfileKey } from "./browser-post-state";
import { PortalFeedbackForm } from "./portal-feedback-form";

const server = vi.hoisted(() => ({
  submitPortalPost: vi.fn(),
  editPortalFeedbackDraft: vi.fn(),
  withdrawPortalFeedbackDraft: vi.fn(),
}));

vi.mock("./portal-feedback-server-function", () => server);

beforeEach(() => {
  localStorage.clear();
  server.submitPortalPost.mockReset().mockResolvedValue({
    id: "post-id",
    slug: "keyboard-navigation",
    browserCapability: "secret-capability",
  });
  server.editPortalFeedbackDraft.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("Post creation and the Device Profile", () => {
  it("attaches the current Device Profile privately to a new submission", async () => {
    localStorage.setItem(
      deviceProfileKey,
      JSON.stringify({ name: "Ama", email: "ama@example.com" }),
    );
    render(<PortalFeedbackForm />);

    fillPostForm("Keyboard navigation", "Support keyboard-only use.");
    fireEvent.click(screen.getByRole("button", { name: "Create Post" }));

    await waitFor(() =>
      expect(server.submitPortalPost).toHaveBeenCalledWith({
        data: {
          title: "Keyboard navigation",
          description: "Support keyboard-only use.",
          type: "Feature Request",
          submitter: { name: "Ama", email: "ama@example.com" },
        },
      }),
    );
  });

  it("does not apply a newly saved Device Profile when editing an existing Draft Post", async () => {
    localStorage.setItem(
      deviceProfileKey,
      JSON.stringify({ name: "New Participant" }),
    );
    render(
      <PortalFeedbackForm
        initialDraft={{
          id: "existing-id",
          browserCapability: "existing-capability",
          title: "Existing draft",
          description: "Existing description",
          type: "Bug Report",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(server.editPortalFeedbackDraft).toHaveBeenCalledWith({
        data: {
          id: "existing-id",
          browserCapability: "existing-capability",
          title: "Existing draft",
          description: "Existing description",
          type: "Bug Report",
        },
      }),
    );
  });
});

function fillPostForm(title: string, description: string) {
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: title },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: description },
  });
}
