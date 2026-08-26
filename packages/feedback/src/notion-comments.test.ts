import { describe, expect, it, vi } from "vitest";

import { createNotionCommentStorage } from "./notion-comments";

describe("Notion Comment HTTP boundary", () => {
  it("creates native page Comments and discussion replies with a custom display name", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          notionComment({
            id: "created-comment",
            display_name: { type: "custom", resolved_name: "Ari" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          notionComment({
            id: "created-reply",
            display_name: { type: "custom", resolved_name: "Ari" },
          }),
        ),
      );
    const comments = createNotionCommentStorage({
      token: "notion-token",
      dataSourceId: "feedback",
      propertyIds: {} as never,
      request,
    });

    await comments.createPageComment({
      postId: "page-1",
      body: "A public message",
      displayName: "Ari",
    });
    await comments.createDiscussionReply({
      postId: "page-1",
      discussionId: "discussion-1",
      body: "A reply",
      displayName: "Ari",
    });

    expect(
      request.mock.calls.map((call) => JSON.parse(String(call[1]?.body))),
    ).toEqual([
      {
        parent: { page_id: "page-1" },
        rich_text: [{ type: "text", text: { content: "A public message" } }],
        display_name: { type: "custom", custom: { name: "Ari" } },
      },
      {
        discussion_id: "discussion-1",
        rich_text: [{ type: "text", text: { content: "A reply" } }],
        display_name: { type: "custom", custom: { name: "Ari" } },
      },
    ]);
  });
  it("requests 50 page Comments, preserves the cursor, and classifies public authors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          notionComment({
            id: "participant",
            display_name: { type: "custom", resolved_name: "Ari" },
          }),
          notionComment({ id: "team", discussion_id: "discussion-1" }),
          notionComment({ id: "resolved", resolved: true }),
        ],
        has_more: true,
        next_cursor: "next-native-cursor",
      }),
    );
    const comments = createNotionCommentStorage({
      token: "notion-token",
      dataSourceId: "feedback",
      propertyIds: {} as never,
      request,
    });

    await expect(
      comments.listPageComments("page-1", "start-native-cursor"),
    ).resolves.toMatchObject({
      items: [
        { author: { kind: "participant", displayName: "Ari" }, scope: "page" },
        {
          author: { kind: "product-team", displayName: "Product Team" },
          scope: "page",
        },
      ],
      nextCursor: "next-native-cursor",
    });
    expect(String(request.mock.calls[0]?.[0])).toBe(
      "https://api.notion.com/v1/comments?block_id=page-1&page_size=50&start_cursor=start-native-cursor",
    );
  });

  it("returns actionable repair instructions for missing read permission", async () => {
    const comments = createNotionCommentStorage({
      token: "notion-token",
      dataSourceId: "feedback",
      propertyIds: {} as never,
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403 })),
    });
    await expect(comments.listPageComments("page-1")).rejects.toThrow(
      "Enable read comment content for the connection, then retry.",
    );
  });

  it("updates and deletes native Comments", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(notionComment({ id: "comment-1" })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const comments = createNotionCommentStorage({
      token: "notion-token",
      dataSourceId: "feedback",
      propertyIds: {} as never,
      request,
    });

    await comments.updateComment("comment-1", "Corrected message");
    await comments.deleteComment("comment-1");

    expect(String(request.mock.calls[0]?.[0])).toBe(
      "https://api.notion.com/v1/comments/comment-1",
    );
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        rich_text: [{ type: "text", text: { content: "Corrected message" } }],
      }),
    });
    expect(request.mock.calls[1]).toMatchObject([
      "https://api.notion.com/v1/comments/comment-1",
      expect.objectContaining({ method: "DELETE" }),
    ]);
  });

  it("returns actionable permission failures for native Comment mutations", async () => {
    const comments = createNotionCommentStorage({
      token: "notion-token",
      dataSourceId: "feedback",
      propertyIds: {} as never,
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403 })),
    });

    await expect(
      comments.updateComment("comment-1", "Updated"),
    ).rejects.toThrow("permission to update this Comment");
    await expect(comments.deleteComment("comment-1")).rejects.toThrow(
      "permission to delete this Comment",
    );
  });
});

function notionComment(overrides: Record<string, unknown>) {
  return {
    object: "comment",
    id: "comment-1",
    parent: { type: "page_id", page_id: "page-1" },
    discussion_id: "discussion-1",
    created_time: "2026-08-20T13:00:00.000Z",
    rich_text: [{ plain_text: "A public message" }],
    ...overrides,
  };
}
