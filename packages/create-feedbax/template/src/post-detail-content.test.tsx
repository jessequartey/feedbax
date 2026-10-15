// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PostDetailContent } from "./post-detail-content";
import { saveDeviceProfile } from "./browser-post-state";

const post = {
  slug: "comment-cache",
  title: "Comment cache",
  description: "Feedback",
  type: "Feature Request" as const,
  status: "Planned" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const author = { kind: "participant" as const, displayName: "Ama" };
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it.each(["edit", "delete"] as const)(
  "preserves a confirmed Comment %s when another page arrives",
  async (action) => {
    saveDeviceProfile(localStorage, { name: "Ama", email: "ama@example.com" });
    localStorage.setItem(
      "feedbax:comment-capabilities",
      JSON.stringify({
        "comment-1": {
          capability: "capability",
          expiresAt: Date.now() + 60000,
        },
      }),
    );
    let state: "original" | "edit" | "delete" = "original";
    const loadComments = vi.fn(async (_slug: string, cursor?: string) =>
      cursor
        ? {
            items: [
              {
                id: "thread-2",
                comments: [
                  {
                    id: "comment-2",
                    body: "Second page",
                    author,
                    createdAt: new Date(),
                  },
                ],
              },
            ],
          }
        : {
            items:
              state === "delete"
                ? []
                : [
                    {
                      id: "thread-1",
                      comments: [
                        {
                          id: "comment-1",
                          body:
                            state === "edit"
                              ? "Corrected message"
                              : "Original message",
                          author,
                          createdAt: new Date(),
                        },
                      ],
                    },
                  ],
            nextCursor: "next",
          },
    );
    const mutateComment = vi.fn(async () => {
      state = action;
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PostDetailContent
          post={post}
          loadComments={loadComments}
          mutateComment={mutateComment}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Original message")).toBeTruthy();
    fireEvent.click(
      await screen.findByRole("button", {
        name: action === "edit" ? "Edit" : "Delete",
      }),
    );
    if (action === "edit") {
      fireEvent.change(screen.getByRole("textbox", { name: "Comment text" }), {
        target: { value: "Corrected message" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    }
    await waitFor(() => expect(mutateComment).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByText("Original message")).toBeNull(),
    );
    const more = await screen.findByRole("button", {
      name: "Load more",
    });
    await waitFor(() => expect(more.hasAttribute("disabled")).toBe(false));
    fireEvent.click(more);
    expect(await screen.findByText("Second page")).toBeTruthy();
    expect(screen.queryByText("Original message")).toBeNull();
    expect(screen.queryAllByText("Corrected message")).toHaveLength(
      action === "edit" ? 1 : 0,
    );
  },
);

it("removes a Comment resolved in Notion when the shared query refreshes", async () => {
  let visible = true;
  const loadComments = vi.fn(async () => ({
    items: visible
      ? [
          {
            id: "thread-1",
            comments: [
              {
                id: "comment-1",
                body: "Resolved in Notion",
                author,
                createdAt: new Date(),
              },
            ],
          },
        ]
      : [],
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PostDetailContent post={post} loadComments={loadComments} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Resolved in Notion")).toBeTruthy();
  visible = false;
  void client.invalidateQueries({
    queryKey: ["public-post-comments", post.slug],
  });
  await waitFor(() =>
    expect(screen.queryByText("Resolved in Notion")).toBeNull(),
  );
  expect(screen.getByText("No comments yet")).toBeTruthy();
});

it("keeps private edit capabilities out of the shared public Comment cache", async () => {
  saveDeviceProfile(localStorage, { name: "Ama", email: "ama@example.com" });
  const confirmed = {
    id: "comment-1",
    discussionId: "thread-1",
    body: "Public message",
    author,
    createdAt: new Date(),
    commentCapability: "private-edit-capability",
    commentCapabilityExpiresAt: Date.now() + 60000,
  };
  let submitted = false;
  const loadComments = vi.fn(async () => ({
    items: submitted
      ? [
          {
            id: "thread-1",
            comments: [
              {
                id: confirmed.id,
                body: confirmed.body,
                author,
                createdAt: confirmed.createdAt,
              },
            ],
          },
        ]
      : [],
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const snapshots: string[] = [];
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    snapshots.push(JSON.stringify(event.query.state.data));
  });
  render(
    <QueryClientProvider client={client}>
      <PostDetailContent
        post={post}
        loadComments={loadComments}
        submitComment={async () => {
          submitted = true;
          return confirmed;
        }}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Add a comment"), {
    target: { value: confirmed.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByText(confirmed.body)).toBeTruthy();
  await waitFor(() =>
    expect(localStorage.getItem("feedbax:comment-capabilities")).toContain(
      confirmed.commentCapability,
    ),
  );
  const cached = JSON.stringify(
    client.getQueryData(["public-post-comments", post.slug]),
  );
  expect(cached).toContain(confirmed.body);
  expect(cached).not.toContain("commentCapability");
  expect(cached).not.toContain(confirmed.commentCapability);
  expect(snapshots.join("\n")).not.toContain(confirmed.commentCapability);
  unsubscribe();
});
