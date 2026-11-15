import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LIMITS, type CommentView, type Page } from "@/contracts/domain";
import { addComment, listComments } from "@/server/functions";
import { Markdown } from "./markdown";
import { RichTextField } from "./rich-text-field";
import { clearDraft, commentDraftKey, loadDraft, parseCommentDraft, saveDraft } from "./draft";
import { formatDate, initialOf, plural } from "./format";
import { useWriteGate } from "./viewer";

function CommentItem({ comment }: { comment: CommentView }) {
  return (
    <li className="flex gap-3 py-5">
      <Avatar size="lg" className="mt-0.5">
        <AvatarFallback>
          {comment.author.anonymous ? "?" : initialOf(comment.author.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{comment.author.name}</span>
          <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
            {formatDate(comment.createdAt)}
          </time>
        </p>
        <Markdown source={comment.body} className="mt-1 space-y-2 text-sm leading-normal" />
      </div>
    </li>
  );
}

export function CommentSection({
  postId,
  initial,
  onTotalChange,
}: {
  postId: string;
  initial: Page<CommentView>;
  /** Lets the page keep its own comment count in step with added comments. */
  onTotalChange?: (total: number) => void;
}) {
  const { ensureWriter, reportError } = useWriteGate();
  const fieldId = React.useId();
  const [items, setItems] = React.useState(initial.items);
  const [total, setTotal] = React.useState(initial.total);
  const [page, setPage] = React.useState(initial.page);
  const [hasMore, setHasMore] = React.useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  // The comment id is the idempotency key: it stays the same across retries until the text changes.
  const commentId = React.useRef<string>("");

  // Fresh loader data (after router.invalidate) replaces what we show.
  React.useEffect(() => {
    setItems(initial.items);
    setTotal(initial.total);
    setPage(initial.page);
    setHasMore(initial.hasMore);
  }, [initial]);

  React.useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  React.useEffect(() => {
    const draft = loadDraft(commentDraftKey(postId), parseCommentDraft);
    commentId.current = draft?.id ?? crypto.randomUUID();
    if (draft) setBody(draft.body);
  }, [postId]);

  function onChange(next: string) {
    setBody(next);
    setError(null);
    commentId.current = crypto.randomUUID();
    if (next) saveDraft(commentDraftKey(postId), { id: commentId.current, body: next });
    else clearDraft(commentDraftKey(postId));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return setError("Write a comment first.");
    if (text.length > LIMITS.comment) return setError(`Use at most ${LIMITS.comment} characters.`);
    if (pending) return;
    saveDraft(commentDraftKey(postId), { id: commentId.current, body });
    setPending(true);
    try {
      if (!(await ensureWriter())) return;
      const result = await addComment({ data: { id: commentId.current, postId, body: text } });
      if (!result.ok) {
        if (result.error.field === "body") setError(result.error.message);
        else reportError(result.error);
        return;
      }
      setItems((current) =>
        current.some((c) => c.id === result.data.id) ? current : [...current, result.data],
      );
      setTotal((n) => n + 1);
      setBody("");
      clearDraft(commentDraftKey(postId));
      commentId.current = crypto.randomUUID();
    } catch {
      toast.error("Couldn't reach the server. Your comment is still here, so try again.");
    } finally {
      setPending(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await listComments({ data: { postId, page: page + 1 } });
      setItems((current) => [
        ...current,
        ...next.items.filter((c) => !current.some((existing) => existing.id === c.id)),
      ]);
      setPage(next.page);
      setHasMore(next.hasMore);
    } catch {
      toast.error("Couldn't load more comments. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-labelledby="comments-heading" className="mt-8 border-t pt-6">
      <h2 id="comments-heading" className="text-lg font-semibold">
        Comments{" "}
        <span className="ml-1 border px-1.5 py-0.5 align-middle text-xs font-normal text-muted-foreground tabular-nums">
          {total}
        </span>
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-2">
        <Label id={`${fieldId}-label`} htmlFor={fieldId} className="sr-only">
          Add a comment
        </Label>
        <RichTextField
          id={fieldId}
          aria-labelledby={`${fieldId}-label`}
          variant="comment"
          value={body}
          onChange={onChange}
          maxLength={LIMITS.comment}
          placeholder="Add a comment…"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className="min-h-20"
        />
        <div className="flex items-start justify-between gap-3">
          <p
            id={`${fieldId}-error`}
            role={error ? "alert" : undefined}
            className="text-xs text-destructive"
          >
            {error}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {body.length} / {LIMITS.comment.toLocaleString("en-US")}
            </span>
            <Button type="submit" disabled={pending} className="max-md:h-11">
              {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
              Comment
            </Button>
          </div>
        </div>
      </form>
      {items.length === 0 ? (
        <p className="mt-6 border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ol className="mt-2 divide-y" aria-label={plural(total, "comment")}>
          {items.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ol>
      )}
      {hasMore ? (
        <Button
          variant="outline"
          className="mt-2 w-full max-md:h-11"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
          Load more comments
        </Button>
      ) : null}
    </section>
  );
}
