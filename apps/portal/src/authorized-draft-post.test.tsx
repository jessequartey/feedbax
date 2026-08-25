// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { capabilitiesKey } from "./browser-post-state";
import { readCapabilities } from "./browser-post-state";
import { AuthorizedDraftPost } from "./authorized-draft-post";
import {
  editPortalFeedbackDraft,
  getPortalDraftPost,
  withdrawPortalFeedbackDraft,
} from "./portal-feedback-server-function";

vi.mock("./portal-feedback-server-function", () => ({
  getPortalDraftPost: vi.fn(),
  editPortalFeedbackDraft: vi.fn(),
  withdrawPortalFeedbackDraft: vi.fn(),
  submitPortalPost: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    capabilitiesKey,
    JSON.stringify({
      draft: {
        id: "draft",
        slug: "editable-draft",
        browserCapability: "secret",
      },
    }),
  );
  vi.mocked(getPortalDraftPost).mockResolvedValue(draft);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows an authorized Draft Post in the shared detail layout", async () => {
  renderDraft();

  const article = within(
    await screen.findByRole("article", { name: "Original title" }),
  );
  expect(article.getByText("Draft")).toBeTruthy();
  expect(article.queryByRole("button", { name: /vote/i })).toBeNull();
  expect(article.getByLabelText("Comments unavailable")).toBeTruthy();
  expect(
    within(article.getByRole("region", { name: "Comments" })).getByText(
      "No comments yet",
    ),
  ).toBeTruthy();
  const details = within(
    article.getByRole("complementary", { name: "Details" }),
  );
  expect(details.getByText("New")).toBeTruthy();
  expect(details.getByText("Feature Request")).toBeTruthy();
  expect(details.queryByText("Author")).toBeNull();
  expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Draft actions" })).toBeTruthy();
});

it("edits in place, keeps Cancel unchanged, and reconciles the visible draft", async () => {
  vi.mocked(editPortalFeedbackDraft).mockResolvedValue({
    ...draft,
    title: "Edited title",
  } as never);
  const client = new QueryClient();
  client.setQueryData(["authorized-draft-posts", ["draft"]], [draft]);
  renderDraft(client);

  expect(
    await screen.findByRole("heading", { name: "Original title" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Discarded title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("heading", { name: "Original title" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Edited title" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }));

  expect(
    await screen.findByRole("heading", { name: "Edited title" }),
  ).toBeTruthy();
  expect(
    client.getQueryData<Array<{ title: string }>>([
      "authorized-draft-posts",
      ["draft"],
    ])?.[0]?.title,
  ).toBe("Edited title");
});

it("keeps edit mode open and reports a mutation failure", async () => {
  vi.mocked(editPortalFeedbackDraft).mockRejectedValue(new Error("offline"));
  renderDraft();
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }));

  expect(
    await screen.findByText(
      "The draft could not be changed. Please try again.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
});

it("removes expired authority when Save proves the capability invalid", async () => {
  vi.mocked(editPortalFeedbackDraft).mockRejectedValue(
    new Error("Browser Capability did not authorize this draft."),
  );
  renderDraft();
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }));

  expect(
    await screen.findByRole("heading", { name: "This Post isn’t available." }),
  ).toBeTruthy();
  expect(readCapabilities(localStorage)).toEqual({});
});

it("confirms withdrawal, removes visible state, and cleans up authority", async () => {
  vi.mocked(withdrawPortalFeedbackDraft).mockResolvedValue(undefined);
  const client = new QueryClient();
  client.setQueryData(["authorized-draft-posts", ["draft"]], [draft]);
  renderDraft(client);

  const actions = await screen.findByRole("button", { name: "Draft actions" });
  actions.focus();
  fireEvent.keyDown(actions, { key: "ArrowDown" });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Withdraw draft" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Withdraw Draft Post" }),
  );

  await vi.waitFor(() => expect(readCapabilities(localStorage)).toEqual({}));
  expect(
    client.getQueryData<unknown[]>(["authorized-draft-posts", ["draft"]]),
  ).toEqual([]);
});

it("keeps the draft visible and reports a withdrawal failure", async () => {
  vi.mocked(withdrawPortalFeedbackDraft).mockRejectedValue(
    new Error("offline"),
  );
  renderDraft();

  const actions = await screen.findByRole("button", { name: "Draft actions" });
  actions.focus();
  fireEvent.keyDown(actions, { key: "ArrowDown" });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Withdraw draft" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Withdraw Draft Post" }),
  );

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(
    "The draft could not be withdrawn. Please try again.",
  );
  expect(screen.getByRole("heading", { name: "Original title" })).toBeTruthy();
  expect(Object.keys(readCapabilities(localStorage))).toEqual(["draft"]);
});

function renderDraft(client = new QueryClient()) {
  const root = createRootRoute({
    component: () => <AuthorizedDraftPost slug="editable-draft" />,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/p/editable-draft"] }),
    routeTree: root,
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const draft = {
  id: "draft",
  slug: "editable-draft",
  title: "Original title",
  description: "Original description",
  type: "Feature Request" as const,
  status: "New" as const,
  submitter: {},
  createdAt: new Date("2026-08-22T10:00:00.000Z"),
  updatedAt: new Date("2026-08-22T10:00:00.000Z"),
};
