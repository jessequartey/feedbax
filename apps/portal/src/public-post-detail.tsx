import type { Comment, CommentThreadPage, PublicPost } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { Button } from "@feedbax/ui/components/button";
import { Textarea } from "@feedbax/ui/components/textarea";
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
import { PostStatusBadge, PostTypeBadge } from "./post-badges";
import { formatPublicDate } from "./public-date";
import feedbax from "./feedbax";
import { VoteToggle } from "./vote-toggle";
import type { PortalCommentRequest } from "./portal-comments";
import { isValidCommentEmail } from "./comment-profile";
import {
  DeviceProfilePrompt,
  useDeviceProfile,
} from "./components/device-profile-provider";

const emptyCommentPage: CommentThreadPage = { items: [] };
const commentCapabilitiesKey = "feedbax:comment-capabilities";

export type ConfirmedPortalComment = CreatedComment & {
  commentCapability?: string;
  commentCapabilityExpiresAt?: number;
};

export function PublicPostDetail({
  post,
  display = "page",
  summaryActions,
  summaryMarker,
  features = feedbax.features,
  comments = emptyCommentPage,
  loadMore,
  submitComment,
  mutateComment,
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
  submitComment?: (
    input: PortalCommentRequest,
  ) => Promise<ConfirmedPortalComment>;
  mutateComment?: (input: {
    action: "edit" | "delete";
    commentId: string;
    commentCapability: string;
    body?: string;
  }) => Promise<unknown>;
  turnstileSiteKey?: string;
}) {
  const id = useId();
  const headingId = `${id}-post-heading`;
  const commentsHeadingId = `${id}-post-comments-heading`;
  const detailsHeadingId = `${id}-post-details-heading`;
  const [localComments, setLocalComments] = useState(comments.items);
  const [commentError, setCommentError] = useState<string>();
  const [replyingTo, setReplyingTo] = useState<string>();
  const [commentCapabilities, setCommentCapabilities] = useState<
    Record<string, StoredCommentCapability>
  >({});
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);
  const { completeProfile, ready: profileReady } = useDeviceProfile();

  useEffect(() => {
    setLocalComments((current) =>
      mergeConfirmedComments(current, comments.items),
    );
  }, [comments.items]);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      const current = readStoredCommentCapabilities(window.localStorage);
      setCommentCapabilities(
        Object.fromEntries(
          Object.entries(current).filter(([, value]) => value.expiresAt > now),
        ),
      );
    };
    refresh();
    window.addEventListener("storage", refresh);
    const timer = window.setInterval(refresh, 1_000);
    return () => {
      window.removeEventListener("storage", refresh);
      window.clearInterval(timer);
    };
  }, []);

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
    const profile = completeProfile;
    if (!profile || !isValidCommentEmail(profile.email)) {
      setCommentError(
        "Add a display name and valid email to your Device Profile before commenting.",
      );
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
        email: profile.email,
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
      if (confirmed.commentCapability && confirmed.commentCapabilityExpiresAt)
        setCommentCapabilities(
          saveCommentCapability(
            localStorage,
            confirmed.id,
            confirmed.commentCapability,
            confirmed.commentCapabilityExpiresAt,
          ),
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

  async function changeComment(
    action: "edit" | "delete",
    comment: Comment & { discussionId: string },
  ) {
    if (!mutateComment) return;
    const owned = readCommentCapability(localStorage, comment.id, Date.now());
    if (!owned) return;
    const body =
      action === "edit"
        ? window.prompt("Edit Comment", comment.body)?.trim()
        : undefined;
    if (action === "edit" && !body) return;
    const previous = localComments;
    setCommentError(undefined);
    setLocalComments((current) =>
      action === "delete"
        ? removeComment(current, comment.id)
        : replaceComment(current, comment.id, { ...comment, body: body! }),
    );
    try {
      await mutateComment({
        action,
        commentId: comment.id,
        commentCapability: owned.capability,
        ...(body ? { body } : {}),
      });
      if (action === "delete")
        setCommentCapabilities(
          removeStoredCommentCapability(localStorage, comment.id),
        );
    } catch (error) {
      setLocalComments(previous);
      setCommentError(
        error instanceof Error
          ? error.message
          : "Comment could not be changed. Try again.",
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
                      {thread.comments.map((comment, index) => {
                        const canChange = Boolean(
                          mutateComment && commentCapabilities[comment.id],
                        );
                        const canReply = Boolean(
                          index === 0 && submitComment && completeProfile,
                        );
                        return (
                          <div
                            className="comment"
                            data-reply={index > 0 || undefined}
                            key={comment.id}
                          >
                            <header className="comment-header">
                              <div className="comment-author">
                                <strong>{comment.author.displayName}</strong>
                                {comment.author.kind === "participant" ? (
                                  <span>Unverified</span>
                                ) : null}
                              </div>
                              <time dateTime={comment.createdAt.toISOString()}>
                                {formatPublicDate(comment.createdAt, "long")}
                              </time>
                            </header>
                            <p className="comment-body">{comment.body}</p>
                            {canChange || canReply ? (
                              <div
                                className="comment-actions"
                                role="group"
                                aria-label={`Comment actions by ${comment.author.displayName}`}
                              >
                                {canReply ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setReplyingTo(thread.id)}
                                  >
                                    Reply
                                  </Button>
                                ) : null}
                                {canChange ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        void changeComment("edit", {
                                          ...comment,
                                          discussionId: thread.id,
                                        })
                                      }
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() =>
                                        void changeComment("delete", {
                                          ...comment,
                                          discussionId: thread.id,
                                        })
                                      }
                                    >
                                      Delete
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </article>
                  ))}
                </div>
              )}
              {submitComment && profileReady && completeProfile ? (
                <form
                  className="comment-composer"
                  aria-label="Comment composer"
                  onSubmit={createComment}
                >
                  <label
                    className="comment-composer-label"
                    htmlFor={`${id}-comment-body`}
                  >
                    {replyingTo ? "Write a reply" : "Add a comment"}
                  </label>
                  <p className="comment-composer-hint">
                    Your display name is public. Your email is used only to
                    unlock commenting and is never shown.
                  </p>
                  <Textarea
                    className="comment-composer-input"
                    id={`${id}-comment-body`}
                    name="body"
                    rows={4}
                    placeholder="Share context, an example, or a question…"
                    required
                  />
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
                  <div className="comment-composer-actions">
                    <Button type="submit">
                      {replyingTo ? "Post reply" : "Post comment"}
                    </Button>
                    {replyingTo ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setReplyingTo(undefined)}
                      >
                        Cancel reply
                      </Button>
                    ) : null}
                  </div>
                </form>
              ) : submitComment ? (
                <DeviceProfilePrompt purpose="comment" />
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

interface StoredCommentCapability {
  capability: string;
  expiresAt: number;
}

function readStoredCommentCapabilities(storage: Storage) {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(commentCapabilitiesKey) ?? "{}",
    );
    return value && typeof value === "object"
      ? (value as Record<string, StoredCommentCapability>)
      : {};
  } catch {
    return {};
  }
}

function saveCommentCapability(
  storage: Storage,
  commentId: string,
  capability: string,
  expiresAt: number,
) {
  const capabilities = {
    ...readStoredCommentCapabilities(storage),
    [commentId]: { capability, expiresAt },
  };
  storage.setItem(commentCapabilitiesKey, JSON.stringify(capabilities));
  return capabilities;
}

function readCommentCapability(
  storage: Storage,
  commentId: string,
  now: number,
) {
  const value = readStoredCommentCapabilities(storage)[commentId];
  if (
    !value ||
    typeof value.capability !== "string" ||
    typeof value.expiresAt !== "number" ||
    value.expiresAt <= now
  ) {
    if (value) removeStoredCommentCapability(storage, commentId);
    return undefined;
  }
  return value;
}

function removeStoredCommentCapability(storage: Storage, commentId: string) {
  const capabilities = readStoredCommentCapabilities(storage);
  delete capabilities[commentId];
  storage.setItem(commentCapabilitiesKey, JSON.stringify(capabilities));
  return capabilities;
}
