import type { Status } from "./domain.ts";

/**
 * User-written text as it travels in queue payloads (email now, webhooks in 08): the stored
 * Markdown source and a plain-text version. `text` comes
 * from `markdownToPlainText` (src/lib/markdown.ts); build both with `richText()`.
 */
export type RichText = { markdown: string; text: string };

/** The post an email is about, snapshotted when the event happened. */
export type EmailPost = { id: string; title: string; body: RichText };

/**
 * Email notifications (src/email/). Only queued when email is configured (`emailEnabled`).
 * `id` is minted at enqueue and keys Resend's idempotency, so a retried delivery never sends
 * twice. `after` is the last recipient user id already handled: a large audience is sent in
 * slices, each slice a follow-up message.
 */
export type EmailMessage =
  /** A post's status changed: its author and voters. */
  | {
      type: "email.status";
      id: string;
      post: EmailPost;
      from: Status;
      to: Status;
      after?: string;
    }
  /** A new comment: the post's author and everyone who commented on it before. */
  | {
      type: "email.reply";
      id: string;
      post: Omit<EmailPost, "body">;
      comment: { id: string; authorId: string; authorName: string; body: RichText };
      after?: string;
    }
  /** The daily digest of posts created in [since, until), for admins. */
  | { type: "email.digest"; id: string; since: string; until: string; after?: string }
  /** A published changelog entry: everyone who opted in to changelog email. */
  | {
      type: "email.changelog";
      id: string;
      entry: { id: string; title: string; body: RichText; url: string };
      after?: string;
    };

export type SyncMessage =
  | { type: "notion.post"; postId: string }
  /** Moves the Notion row of a deleted post to trash. The post no longer exists in D1. */
  | { type: "notion.archive"; pageId: string }
  | { type: "github.issue"; postId: string }
  /** One attempt at a stored webhook delivery (src/server/webhooks.ts). Retries re-send it. */
  | { type: "webhook.deliver"; deliveryId: string }
  | { type: "notion.poll"; since: string; until: string; cursor: string | null }
  | { type: "github.poll"; since: string; until: string; page: number }
  | EmailMessage;
export type SyncErrorState = {
  status: number | null;
  code: string;
  message: string;
  at: string;
  /** The message type that failed; post-write failures survive a successful poll. */
  type?: SyncMessage["type"];
};
