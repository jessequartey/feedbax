export type SyncMessage =
  | { type: "notion.post"; postId: string }
  /** Moves the Notion row of a deleted post to trash. The post no longer exists in D1. */
  | { type: "notion.archive"; pageId: string }
  | { type: "github.issue"; postId: string }
  | { type: "notion.poll"; since: string; until: string; cursor: string | null }
  | { type: "github.poll"; since: string; until: string; page: number };
export type SyncErrorState = {
  status: number | null;
  code: string;
  message: string;
  at: string;
  /** The message type that failed; post-write failures survive a successful poll. */
  type?: SyncMessage["type"];
};
