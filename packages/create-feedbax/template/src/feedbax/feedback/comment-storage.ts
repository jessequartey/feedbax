import type { CommentAuthor } from "./index";

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
  ): Promise<{ items: StoredComment[]; nextCursor?: string }>;
  updateComment(commentId: string, body: string): Promise<StoredComment>;
  deleteComment(commentId: string): Promise<void>;
}
