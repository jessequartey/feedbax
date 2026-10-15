import { submissionIntent } from "./submission-intent";
import { ImageAttachments, ImageGallery } from "./components/image-attachments";
import { FollowPostButton } from "./components/follow-post-button";
import {
  useConnectedIdentity,
  ConnectedSignInPrompt,
} from "./components/connected-identity-provider";
import { configuredTurnstileSiteKey } from "./turnstile-configuration";
import type { Comment, CommentThreadPage, PublicPost } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { Button } from "@feedbax/ui/components/button";
import { Textarea } from "@feedbax/ui/components/textarea";
import { ArrowLeft } from "lucide-react";
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
import { mergeCommentThreads } from "./comment-thread-page";
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
  published = true,
  summaryActions,
  summaryMarker,
  features = feedbax.features,
  comments = emptyCommentPage,
  commentsLoading = false,
  commentsLoadError = false,
  retryComments,
  loadMore,
  submitComment,
  mutateComment,
  turnstileSiteKey = configuredTurnstileSiteKey(),
}: {
  post: PublicPost;
  display?: "overlay" | "page";
  published?: boolean;
  summaryActions?: ReactNode;
  summaryMarker?: ReactNode;
  features?: PortalFeatures;
  comments?: CommentThreadPage;
  commentsLoading?: boolean;
  commentsLoadError?: boolean;
  retryComments?: () => void;
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
  const [images, setImages] = useState<
    import("@feedbax/feedback").ImageAttachment[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string>();
  const [editingComment, setEditingComment] = useState<{
    id: string;
    body: string;
  }>();
  const [commentCapabilities, setCommentCapabilities] = useState<
    Record<string, StoredCommentCapability>
  >({});
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);
  const { completeProfile, ready: profileReady } = useDeviceProfile();
  const identity = useConnectedIdentity();
  const canComment = identity.enabled
    ? Boolean(identity.displayName)
    : Boolean(completeProfile);

  useEffect(() => {
    setLocalComments((current) =>
      mergeCommentThreads(
        comments.items,
        current
          .map((thread) => ({
            ...thread,
            comments: thread.comments.filter((comment) =>
              comment.id.startsWith("optimistic-"),
            ),
          }))
          .filter((thread) => thread.comments.length > 0),
      ),
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
    const composer = event.currentTarget;
    const form = new FormData(composer);
    const body = String(form.get("body") ?? "").trim();
    const profile = completeProfile;
    if (
      !canComment ||
      (!identity.enabled && (!profile || !isValidCommentEmail(profile.email)))
    ) {
      setCommentError(
        "Add a display name and valid email to your Device Profile before commenting.",
      );
      return;
    }
    if (!body || uploading || submittingComment) return;
    setSubmittingComment(true);
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const discussionId = replyingTo ?? optimisticId;
    const optimistic: CreatedComment = {
      id: optimisticId,
      discussionId,
      body,
      author: {
        kind: "participant",
        displayName: identity.enabled ? identity.displayName! : profile!.name,
      },
      createdAt: new Date(),
    };
    setCommentError(undefined);
    setLocalComments((current) => addComment(current, optimistic));
    try {
      const turnstileToken = form.get("cf-turnstile-response");
      const intent = await submissionIntent(sessionStorage, {
        kind: "comment",
        slug: post.slug,
        discussionId: replyingTo ?? null,
        body,
        imageIds: images.map((image) => image.id),
        session: identity.sessionKey ?? "browser",
        displayName: identity.enabled ? identity.displayName : profile?.name,
      });
      const confirmed = await submitComment({
        submissionKey: intent.key,
        slug: post.slug,
        ...(images.length ? { imageIds: images.map((image) => image.id) } : {}),
        body,
        displayName: identity.enabled ? identity.displayName! : profile!.name,
        email: identity.enabled ? "" : profile!.email,
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
      if (confirmed.commentCapability && confirmed.commentCapabilityExpiresAt)
        setCommentCapabilities(
          saveCommentCapability(
            localStorage,
            confirmed.id,
            confirmed.commentCapability,
            confirmed.commentCapabilityExpiresAt,
          ),
        );
      intent.complete();
      composer.reset();
      setReplyingTo(undefined);
      setImages([]);
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
    } finally {
      setSubmittingComment(false);
    }
  }

  async function changeComment(
    action: "edit" | "delete",
    comment: Comment & { discussionId: string },
    editedBody?: string,
  ) {
    if (!mutateComment) return;
    const owned = readCommentCapability(localStorage, comment.id, Date.now());
    if (!owned) return;
    if (
      action === "delete" &&
      !window.confirm("Delete this Comment? This cannot be undone.")
    )
      return;
    const body = action === "edit" ? editedBody?.trim() : undefined;
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
      if (action === "edit") setEditingComment(undefined);
      if (action === "delete")
        setCommentCapabilities(
          removeStoredCommentCapability(localStorage, comment.id),
        );
    } catch (error) {
      setLocalComments(previous);
      if (action === "edit") setEditingComment(undefined);
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
          {post.images?.length &&
          !published &&
          identity.enabled &&
          !identity.displayName ? (
            <Button
              nativeButton={false}
              render={<a href="/internal/identity/start" />}
              variant="outline"
              size="sm"
            >
              Sign in to view images
            </Button>
          ) : (
            <ImageGallery images={post.images} />
          )}
          {post.teamResponse ? (
            <section
              className="border-l-4 border-primary bg-muted/50 p-4"
              aria-label="Product Team response"
            >
              <h2 className="text-sm font-semibold">Product Team response</h2>
              <p className="mt-2 whitespace-pre-wrap">{post.teamResponse}</p>
              {post.releaseNotesUrl ? (
                <a
                  className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
                  href={post.releaseNotesUrl}
                >
                  Read release notes
                </a>
              ) : null}
            </section>
          ) : null}
          {summaryActions ? (
            <div className="post-detail-summary-actions">{summaryActions}</div>
          ) : null}
          <div className="post-detail-engagement flex flex-wrap items-center gap-3">
            {features.voting && post.voteCount !== undefined ? (
              <VoteToggle post={post} />
            ) : null}
            {published ? <FollowPostButton slug={post.slug} /> : null}
          </div>
          {features.comments ? (
            <section
              className="post-detail-comments"
              aria-labelledby={commentsHeadingId}
            >
              <h2 id={commentsHeadingId}>Comments</h2>
              {submitComment &&
              (identity.enabled ? identity.ready : profileReady) &&
              canComment ? (
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
                    {identity.enabled
                      ? `Posting as ${identity.displayName}.`
                      : "Your name is public. Your email stays private."}
                  </p>
                  <Textarea
                    ref={composerInput}
                    className="comment-composer-input"
                    id={`${id}-comment-body`}
                    name="body"
                    rows={3}
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
                  <ImageAttachments
                    value={images}
                    onChange={setImages}
                    onUploadingChange={setUploading}
                  />
                  <div className="comment-composer-actions">
                    <Button
                      type="submit"
                      disabled={uploading || submittingComment}
                    >
                      {submittingComment
                        ? "Posting…"
                        : replyingTo
                          ? "Post reply"
                          : "Post comment"}
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
              ) : submitComment && identity.enabled ? (
                <ConnectedSignInPrompt />
              ) : submitComment ? (
                <DeviceProfilePrompt purpose="comment" />
              ) : null}
              {commentError ? <p role="alert">{commentError}</p> : null}
              <div
                className="post-detail-thread-list"
                role="region"
                aria-label="Comment threads"
                tabIndex={localComments.length ? 0 : undefined}
              >
                {commentsLoading && localComments.length === 0 ? (
                  <PostCommentsSkeleton />
                ) : commentsLoadError &&
                  localComments.length === 0 ? null : localComments.length ===
                  0 ? (
                  <p className="py-5 text-sm text-muted-foreground">
                    No comments yet
                  </p>
                ) : (
                  <div className="comment-threads">
                    {localComments.map((thread) => (
                      <article className="comment-thread" key={thread.id}>
                        {thread.comments.map((comment, index) => {
                          const canChange = Boolean(
                            mutateComment && commentCapabilities[comment.id],
                          );
                          const canReply = Boolean(
                            index === 0 && submitComment && canComment,
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
                                    <span>
                                      {comment.author.verified
                                        ? "Verified"
                                        : "Unverified"}
                                    </span>
                                  ) : null}
                                </div>
                                <time
                                  dateTime={comment.createdAt.toISOString()}
                                >
                                  {formatPublicDate(comment.createdAt, "long")}
                                </time>
                              </header>
                              {editingComment?.id === comment.id ? (
                                <form
                                  className="mt-3 space-y-2"
                                  aria-label="Edit Comment"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void changeComment(
                                      "edit",
                                      { ...comment, discussionId: thread.id },
                                      editingComment.body,
                                    );
                                  }}
                                >
                                  <Textarea
                                    aria-label="Comment text"
                                    value={editingComment.body}
                                    onChange={(event) =>
                                      setEditingComment({
                                        id: comment.id,
                                        body: event.target.value,
                                      })
                                    }
                                    required
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" type="submit">
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="ghost"
                                      onClick={() =>
                                        setEditingComment(undefined)
                                      }
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </form>
                              ) : (
                                <>
                                  <p className="comment-body">{comment.body}</p>
                                  <ImageGallery images={comment.images} />
                                </>
                              )}
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
                                      onClick={() => {
                                        setReplyingTo(thread.id);
                                        composerInput.current?.focus();
                                      }}
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
                                          setEditingComment({
                                            id: comment.id,
                                            body: comment.body,
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
                {commentsLoadError ? (
                  <div className="space-y-3 py-4">
                    <p role="alert" className="text-sm text-muted-foreground">
                      Comments could not be loaded.
                    </p>
                    {retryComments ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={retryComments}
                      >
                        Retry Comments
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {loadMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={commentsLoading}
                    onClick={() => void loadMore()}
                  >
                    {commentsLoading ? "Loading Comments…" : "Load more"}
                  </Button>
                ) : null}
              </div>
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

function PostCommentsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading Comments"
      aria-busy="true"
      className="space-y-5 py-6"
    >
      <span className="sr-only">Loading Comments…</span>
      <div aria-hidden="true" className="space-y-4">
        {[0, 1].map((row) => (
          <div key={row} className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { PublicPostDetailSkeleton } from "./public-post-detail-skeleton";

function addComment(
  threads: CommentThreadPage["items"],
  comment: CreatedComment,
) {
  return mergeCommentThreads(threads, [
    { id: comment.discussionId, comments: [comment] },
  ]);
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
