import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { ArrowLeft, MessageCircle } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { CreatedComment } from "@feedbax/feedback";
import { readDeviceProfile } from "./browser-post-state";
import { PostStatusBadge, PostTypeBadge } from "./post-badges";
import { formatPublicDate } from "./public-date";
import feedbax from "./feedbax";
import { VoteToggle } from "./vote-toggle";
import type { PortalCommentRequest } from "./portal-comments";

const emptyCommentPage: CommentThreadPage = { items: [] };

export function PublicPostDetail({
  post,
  display = "page",
  summaryActions,
  summaryMarker,
  features = feedbax.features,
  comments = emptyCommentPage,
  loadMore,
  submitComment,
  turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as
    string | undefined,
}: {
  post: PublicPost;
  display?: "overlay" | "page";
  summaryActions?: ReactNode;
  summaryMarker?: ReactNode;
  features?: PortalFeatures;
  comments?: CommentThreadPage;
  loadMore?: () => Promise<void>;
  submitComment?: (input: PortalCommentRequest) => Promise<CreatedComment>;
  turnstileSiteKey?: string;
}) {
  const id = useId();
  const headingId = `${id}-post-heading`;
  const commentsHeadingId = `${id}-post-comments-heading`;
  const detailsHeadingId = `${id}-post-details-heading`;
  const [localComments, setLocalComments] = useState(comments.items);
  const [commentError, setCommentError] = useState<string>();
  const [replyingTo, setReplyingTo] = useState<string>();
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);

  useEffect(() => {
    setLocalComments((current) =>
      mergeConfirmedComments(current, comments.items),
    );
  }, [comments.items]);

  useEffect(() => {
    if (
      !submitComment ||
      !turnstileSiteKey ||
      sessionStorage.getItem("feedbax:participation-pass")
    )
      return;
    const render = () => {
      if (
        !turnstileWidget.current &&
        window.turnstile &&
        turnstileContainer.current
      )
        turnstileWidget.current = window.turnstile.render(
          turnstileContainer.current,
          { sitekey: turnstileSiteKey },
        );
    };
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-turnstile]",
    );
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
      return () => existing.removeEventListener("load", render);
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    script.addEventListener("load", render, { once: true });
    document.head.append(script);
    return () => script.removeEventListener("load", render);
  }, [commentError, submitComment, turnstileSiteKey]);

  async function createComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitComment) return;
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    const profile = readDeviceProfile(window.localStorage);
    if (!profile) {
      setCommentError("Set a Device Profile display name before commenting.");
      return;
    }
    if (!body) return;
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const discussionId = replyingTo ?? optimisticId;
    const optimistic: CreatedComment = {
      id: optimisticId,
      discussionId,
      body,
      author: { kind: "participant", displayName: profile.name },
      createdAt: new Date(),
    };
    setCommentError(undefined);
    setLocalComments((current) => addComment(current, optimistic));
    event.currentTarget.reset();
    setReplyingTo(undefined);
    try {
      const turnstileToken = form.get("cf-turnstile-response");
      const confirmed = await submitComment({
        slug: post.slug,
        body,
        displayName: profile.name,
        ...(replyingTo ? { discussionId: replyingTo } : {}),
        ...(turnstileToken ? { turnstileToken: String(turnstileToken) } : {}),
        ...(sessionStorage.getItem("feedbax:participation-pass")
          ? {
              participationPass: sessionStorage.getItem(
                "feedbax:participation-pass",
              )!,
            }
          : {}),
      });
      setLocalComments((current) =>
        replaceComment(current, optimisticId, confirmed),
      );
    } catch (error) {
      setLocalComments((current) => removeComment(current, optimisticId));
      setCommentError(
        error instanceof Error
          ? error.message
          : "Comment could not be saved. Try again.",
      );
    }
  }

  return (
    <main className="feedback-detail public-post-detail" data-display={display}>
      {display === "page" ? (
        <a className="feedback-detail-back" href="/">
          <ArrowLeft aria-hidden="true" /> Back to Feedback
        </a>
      ) : null}
      <article className="post-detail-layout" aria-labelledby={headingId}>
        <div className="post-detail-primary">
          <div className="feedback-detail-meta">
            <PostTypeBadge type={post.type} />
            <PostStatusBadge status={post.status} />
            {summaryMarker}
          </div>
          <h1 id={headingId}>{post.title}</h1>
          <p className="feedback-detail-description">{post.description}</p>
          {summaryActions ? (
            <div className="post-detail-summary-actions">{summaryActions}</div>
          ) : null}
          {features.voting && post.voteCount !== undefined ? (
            <div className="post-detail-engagement">
              <VoteToggle post={post} />
            </div>
          ) : null}
          {features.comments ? (
            <section
              className="post-detail-comments"
              aria-labelledby={commentsHeadingId}
            >
              <h2 id={commentsHeadingId}>Comments</h2>
              {localComments.length === 0 ? (
                <Empty className="post-detail-comments-empty">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageCircle aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No comments yet</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="comment-threads">
                  {localComments.map((thread) => (
                    <article className="comment-thread" key={thread.id}>
                      {thread.comments.map((comment) => (
                        <div className="comment" key={comment.id}>
                          <header>
                            <strong>{comment.author.displayName}</strong>
                            {comment.author.kind === "participant" ? (
                              <span>Unverified</span>
                            ) : null}
                            <time dateTime={comment.createdAt.toISOString()}>
                              {formatPublicDate(comment.createdAt, "long")}
                            </time>
                          </header>
                          <p>{comment.body}</p>
                        </div>
                      ))}
                      {submitComment ? (
                        <button
                          type="button"
                          onClick={() => setReplyingTo(thread.id)}
                        >
                          Reply
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              {submitComment ? (
                <form onSubmit={createComment}>
                  <label htmlFor={`${id}-comment-body`}>
                    {replyingTo ? "Write a reply" : "Add a comment"}
                  </label>
                  <textarea id={`${id}-comment-body`} name="body" required />
                  {turnstileSiteKey &&
                  !sessionStorage.getItem("feedbax:participation-pass") ? (
                    <div
                      ref={(element) => {
                        turnstileContainer.current = element;
                        if (
                          element &&
                          window.turnstile &&
                          !turnstileWidget.current
                        )
                          turnstileWidget.current = window.turnstile.render(
                            element,
                            { sitekey: turnstileSiteKey },
                          );
                      }}
                      className="cf-turnstile"
                      data-sitekey={turnstileSiteKey}
                    />
                  ) : null}
                  <button type="submit">
                    {replyingTo ? "Post reply" : "Post comment"}
                  </button>
                  {replyingTo ? (
                    <button
                      type="button"
                      onClick={() => setReplyingTo(undefined)}
                    >
                      Cancel reply
                    </button>
                  ) : null}
                </form>
              ) : null}
              {commentError ? <p role="alert">{commentError}</p> : null}
              {loadMore ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => void loadMore()}
                >
                  Load more
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
        <aside
          className="post-detail-sidebar"
          aria-labelledby={detailsHeadingId}
        >
          <h2 id={detailsHeadingId}>Details</h2>
          <dl className="post-detail-details">
            <div>
              <dt>Status</dt>
              <dd>
                <PostStatusBadge status={post.status} />
              </dd>
            </div>
            <div>
              <dt>Post type</dt>
              <dd>{post.type}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                <time dateTime={post.createdAt.toISOString()}>
                  {formatPublicDate(post.createdAt, "long")}
                </time>
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>
                <time dateTime={post.updatedAt.toISOString()}>
                  {formatPublicDate(post.updatedAt, "long")}
                </time>
              </dd>
            </div>
          </dl>
        </aside>
      </article>
    </main>
  );
}

export function PublicPostDetailSkeleton() {
  return (
    <main
      className="feedback-detail post-detail-skeleton"
      aria-label="Loading Post details"
      aria-busy="true"
    >
      <div aria-hidden="true">
        <Skeleton className="post-detail-skeleton-back" />
        <article>
          <Skeleton className="post-detail-skeleton-meta" />
          <Skeleton className="post-detail-skeleton-title" />
          <Skeleton className="post-detail-skeleton-copy" />
          <Skeleton className="post-detail-skeleton-copy post-detail-skeleton-copy-short" />
        </article>
      </div>
      <span className="sr-only">Loading Post details…</span>
    </main>
  );
}

function addComment(
  threads: CommentThreadPage["items"],
  comment: CreatedComment,
) {
  const existing = threads.find((thread) => thread.id === comment.discussionId);
  return existing
    ? threads.map((thread) =>
        thread.id === comment.discussionId
          ? { ...thread, comments: [...thread.comments, comment] }
          : thread,
      )
    : [...threads, { id: comment.discussionId, comments: [comment] }];
}

function removeComment(threads: CommentThreadPage["items"], commentId: string) {
  return threads
    .map((thread) => ({
      ...thread,
      comments: thread.comments.filter((comment) => comment.id !== commentId),
    }))
    .filter((thread) => thread.comments.length > 0);
}

function replaceComment(
  threads: CommentThreadPage["items"],
  optimisticId: string,
  confirmed: CreatedComment,
) {
  return addComment(removeComment(threads, optimisticId), confirmed);
}

function mergeConfirmedComments(
  current: CommentThreadPage["items"],
  confirmed: CommentThreadPage["items"],
) {
  const merged = new Map(current.map((thread) => [thread.id, thread]));
  for (const thread of confirmed) {
    const existing = merged.get(thread.id);
    if (!existing) {
      merged.set(thread.id, thread);
      continue;
    }
    const comments = new Map(
      existing.comments.map((comment) => [comment.id, comment]),
    );
    for (const comment of thread.comments) comments.set(comment.id, comment);
    merged.set(thread.id, { ...existing, comments: [...comments.values()] });
  }
  return [...merged.values()];
}
