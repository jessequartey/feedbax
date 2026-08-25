import type { CommentAuthor } from "./index";
import type { NotionFeedbackStorageOptions } from "./notion-feedback";
import { requestNotion } from "./notion-request";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

export interface StoredComment {
  id: string;
  postId: string;
  discussionId: string;
  body: string;
  author: CommentAuthor;
  createdAt: Date;
  resolved: boolean;
  scope?: "page" | "block";
}

export interface CommentStorage {
  createPageComment(input: {
    postId: string;
    body: string;
    displayName: string;
  }): Promise<StoredComment>;
  createDiscussionReply(input: {
    postId: string;
    discussionId: string;
    body: string;
    displayName: string;
  }): Promise<StoredComment>;
  listPageComments(
    postId: string,
    cursor?: string,
  ): Promise<{
    items: StoredComment[];
    nextCursor?: string;
  }>;
}

export function createNotionCommentStorage({
  token,
  request = fetch,
  retry,
}: NotionFeedbackStorageOptions): CommentStorage {
  return {
    createPageComment: (input) =>
      createComment({
        parent: { page_id: input.postId },
        body: input.body,
        displayName: input.displayName,
        postId: input.postId,
      }),
    createDiscussionReply: (input) =>
      createComment({
        discussion_id: input.discussionId,
        body: input.body,
        displayName: input.displayName,
        postId: input.postId,
      }),
    async listPageComments(postId, cursor) {
      const url = new URL(`${NOTION_API_URL}/comments`);
      url.searchParams.set("block_id", postId);
      url.searchParams.set("page_size", "50");
      if (cursor) url.searchParams.set("start_cursor", cursor);
      const response = await requestNotion(
        url,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": NOTION_API_VERSION,
          },
        },
        { request, retry, operation: "idempotent" },
      );
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "Notion cannot read Comments. Enable read comment content for the connection, then retry."
            : `Notion rejected the Comment request (${response.status}).`,
        );
      const value: unknown = await response.json();
      if (!isRecord(value) || !Array.isArray(value.results))
        throw new Error("Notion returned an invalid Comment list.");
      const items = value.results
        .map((entry) => commentFromNotion(entry, postId))
        .filter((comment) => !comment.resolved);
      const nextCursor =
        value.has_more === true ? value.next_cursor : undefined;
      if (nextCursor !== undefined && typeof nextCursor !== "string")
        throw new Error("Notion returned an invalid Comment cursor.");
      return { items, ...(nextCursor ? { nextCursor } : {}) };
    },
  };

  async function createComment(input: {
    parent?: { page_id: string };
    discussion_id?: string;
    body: string;
    displayName: string;
    postId: string;
  }): Promise<StoredComment> {
    const response = await requestNotion(
      `${NOTION_API_URL}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_API_VERSION,
        },
        body: JSON.stringify({
          ...(input.parent ? { parent: input.parent } : {}),
          ...(input.discussion_id
            ? { discussion_id: input.discussion_id }
            : {}),
          rich_text: [{ type: "text", text: { content: input.body } }],
          display_name: {
            type: "custom",
            custom: { name: input.displayName },
          },
        }),
      },
      { request, retry, operation: "create" },
    );
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Notion cannot create Comments. Enable insert comment capability for the connection, then retry."
          : `Notion rejected the Comment creation (${response.status}).`,
      );
    return commentFromNotion(await response.json(), input.postId);
  }
}

function commentFromNotion(value: unknown, postId: string): StoredComment {
  if (!isRecord(value)) throw new Error("Notion returned an invalid Comment.");
  const id = requiredString(value.id, "Comment ID");
  const discussionId = requiredString(value.discussion_id, "discussion ID");
  const createdAt = new Date(
    requiredString(value.created_time, "created time"),
  );
  if (Number.isNaN(createdAt.getTime()))
    throw new Error("Notion returned an invalid Comment created time.");
  const parent = value.parent;
  const pageLevel =
    isRecord(parent) && parent.type === "page_id" && parent.page_id === postId;
  const richText = Array.isArray(value.rich_text) ? value.rich_text : [];
  const body = richText
    .map((part) =>
      isRecord(part) && typeof part.plain_text === "string"
        ? part.plain_text
        : "",
    )
    .join("");
  const displayName = value.display_name;
  const participantName =
    isRecord(displayName) &&
    displayName.type === "custom" &&
    typeof displayName.resolved_name === "string" &&
    displayName.resolved_name.trim()
      ? displayName.resolved_name.trim()
      : undefined;
  return {
    id,
    postId,
    discussionId,
    body,
    author: participantName
      ? { kind: "participant", displayName: participantName }
      : { kind: "product-team", displayName: "Product Team" },
    createdAt,
    resolved: value.resolved === true,
    scope: pageLevel ? "page" : "block",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`Notion returned an invalid ${label}.`);
  return value;
}
