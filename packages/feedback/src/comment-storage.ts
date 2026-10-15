import type { CommentAuthor } from "./index";

export interface StoredComment {
  recoverable?: boolean;
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
  supportsIntentRecovery?: boolean;
  createPageComment(input: {
    submissionKey?: string;
    recoveryCommentId?: string;
    postId: string;
    body: string;
    displayName: string;
  }): Promise<StoredComment>;
  createDiscussionReply(input: {
    submissionKey?: string;
    recoveryCommentId?: string;
    postId: string;
    discussionId: string;
    body: string;
    displayName: string;
  }): Promise<StoredComment>;
  listPageComments(
    postId: string,
    cursor?: string,
  ): Promise<{ items: StoredComment[]; nextCursor?: string }>;
  updateComment(commentId: string, body: string): Promise<StoredComment>;
  deleteComment(commentId: string): Promise<void>;
}
