import type { CommentThreadPage } from "@feedbax/feedback";

export function mergeCommentThreads(
  current: CommentThreadPage["items"],
  next: CommentThreadPage["items"],
): CommentThreadPage["items"] {
  const merged = new Map(current.map((thread) => [thread.id, thread]));
  for (const thread of next) {
    const existing = merged.get(thread.id);
    merged.set(
      thread.id,
      existing
        ? {
            ...existing,
            comments: [
              ...new Map(
                [...existing.comments, ...thread.comments].map((comment) => [
                  comment.id,
                  comment,
                ]),
              ).values(),
            ],
          }
        : thread,
    );
  }
  return [...merged.values()];
}
