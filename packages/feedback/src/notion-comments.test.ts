import { describe, expect, it, vi } from "vitest";

import { createNotionCommentStorage } from "./notion-comments";

describe("Notion Comment HTTP boundary", () => {
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
