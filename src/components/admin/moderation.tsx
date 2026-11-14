import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  EyeIcon,
  EyeOffIcon,
  GitMergeIcon,
  CircleDotIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  ModerationComment,
  ModerationFilter,
  ModerationPost,
  ModerationPostPage,
} from "@/contracts/admin";
import type { Page } from "@/contracts/domain";
import { formatDate, plural } from "@/components/portal/format";
import { CategoryBadge, StatusBadge } from "@/components/portal/post-badges";
import { PaginationBar } from "@/components/portal/pagination-bar";
import { Markdown } from "@/components/portal/markdown";
import { EmptyState } from "@/components/portal/states";
import { markdownToText } from "@/lib/markdown";
import {
  adminDeleteComment,
  adminDeletePost,
  adminSendToGitHub,
  adminSetPostState,
} from "@/server/functions";
import { ConfirmDialog } from "./confirm-dialog";
import { MergeDialog } from "./merge-dialog";
import { useAdminAction } from "./use-admin";

const FILTERS: { value: ModerationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hidden", label: "Hidden" },
  { value: "spam", label: "Spam" },
];

export function FilterControl({
  value,
  onChange,
}: {
  value: ModerationFilter;
  onChange: (filter: ModerationFilter) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Filter posts"
      variant="outline"
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        const chosen = next[0] as ModerationFilter | undefined;
        if (chosen) onChange(chosen);
      }}
      className="w-full md:w-fit"
    >
      {FILTERS.map((filter) => (
        <ToggleGroupItem
          key={filter.value}
          value={filter.value}
          className="h-9 flex-1 px-4 max-md:h-11 md:flex-none"
        >
          {filter.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function StateBadge({ post }: { post: ModerationPost }) {
  if (post.mergedInto)
    return (
      <Badge variant="outline" className="h-6 gap-1.5 px-2 font-normal">
        <GitMergeIcon aria-hidden="true" />
        <Link to="/posts/$postId" params={{ postId: post.mergedInto }} className="underline">
          Merged
        </Link>
      </Badge>
    );
  if (post.state === "spam")
    return (
      <Badge variant="destructive" className="h-6 gap-1.5 px-2 font-normal">
        <ShieldAlertIcon aria-hidden="true" />
        Spam
      </Badge>
    );
  if (post.state === "hidden")
    return (
      <Badge variant="secondary" className="h-6 gap-1.5 px-2 font-normal">
        <EyeOffIcon aria-hidden="true" />
        Hidden
      </Badge>
    );
  return null;
}

type Dialog = { kind: "delete"; post: ModerationPost } | null;

function PostRow({
  post,
  githubEnabled,
  onDelete,
  onMerge,
}: {
  post: ModerationPost;
  githubEnabled: boolean;
  onDelete: (post: ModerationPost) => void;
  onMerge: (post: ModerationPost) => void;
}) {
  const act = useAdminAction();
  const merged = post.mergedInto !== null;
  const canSend = githubEnabled && !merged && post.state !== "spam" && !post.githubRequested;
  const set = (state: "visible" | "hidden" | "spam", message: string) =>
    void act(() => adminSetPostState({ data: { postId: post.id, state } }), message);
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:gap-5 md:p-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-base leading-snug font-medium md:text-lg">
          <Link
            to="/posts/$postId"
            params={{ postId: post.id }}
            className="break-words underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {post.title}
          </Link>
        </h3>
        {post.excerpt ? (
          <p className="mt-1 line-clamp-2 text-sm break-words text-muted-foreground">
            {post.excerpt}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <StateBadge post={post} />
          <CategoryBadge category={post.category} />
          <StatusBadge status={post.status} />
          {post.githubUrl ? (
            <Badge variant="outline" className="h-6 gap-1.5 px-2 font-normal">
              <CircleDotIcon aria-hidden="true" />
              <a
                href={post.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Issue
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Badge>
          ) : post.githubRequested ? (
            <Badge variant="outline" className="h-6 gap-1.5 px-2 font-normal">
              <CircleDotIcon aria-hidden="true" />
              Issue pending
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {post.author.name} · {formatDate(post.createdAt)} · {plural(post.votes, "vote")} ·{" "}
            {plural(post.comments, "comment")}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {post.state === "visible" ? (
          <Button
            variant="outline"
            className="h-9 max-md:h-11"
            onClick={() => set("hidden", "Post hidden.")}
          >
            <EyeOffIcon aria-hidden="true" /> Hide
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-9 max-md:h-11"
            onClick={() => set("visible", "Post restored.")}
          >
            {post.state === "spam" ? (
              <ShieldCheckIcon aria-hidden="true" />
            ) : (
              <EyeIcon aria-hidden="true" />
            )}
            {post.state === "spam" ? "Not spam" : "Unhide"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={`More actions for ${post.title}`}
                className="size-9 max-md:size-11"
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {post.state !== "spam" ? (
              <DropdownMenuItem onClick={() => set("spam", "Marked as spam and hidden.")}>
                <ShieldAlertIcon aria-hidden="true" /> Mark as spam
              </DropdownMenuItem>
            ) : null}
            {!merged && post.state === "visible" ? (
              <DropdownMenuItem onClick={() => onMerge(post)}>
                <GitMergeIcon aria-hidden="true" /> Merge duplicate…
              </DropdownMenuItem>
            ) : null}
            {canSend ? (
              <DropdownMenuItem
                onClick={() =>
                  void act(
                    () => adminSendToGitHub({ data: { postId: post.id } }),
                    "Queued. The GitHub issue will appear shortly.",
                  )
                }
              >
                <CircleDotIcon aria-hidden="true" /> Send to GitHub
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(post)}>
              <Trash2Icon aria-hidden="true" /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function PostModeration({
  page,
  filter,
  onPage,
}: {
  page: ModerationPostPage;
  filter: ModerationFilter;
  onPage: (page: number) => void;
}) {
  const act = useAdminAction();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [merging, setMerging] = React.useState<ModerationPost | null>(null);
  // Keep the post the dialog is about while it fades out.
  const last = React.useRef<ModerationPost | null>(null);
  if (dialog) last.current = dialog.post;
  const target = dialog?.post ?? last.current;
  return (
    <>
      {page.items.length === 0 ? (
        <div className="border">
          <EmptyState
            title={filter === "all" ? "No posts yet" : `No ${filter} posts`}
            description={
              filter === "all"
                ? "New feedback shows up here, newest first."
                : "Posts you mark that way are listed here."
            }
          />
        </div>
      ) : (
        <ul className="divide-y border" aria-label="Posts">
          {page.items.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              githubEnabled={page.githubEnabled}
              onDelete={(item) => setDialog({ kind: "delete", post: item })}
              onMerge={setMerging}
            />
          ))}
        </ul>
      )}
      <PaginationBar page={page} onPage={onPage} />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => (open ? undefined : setDialog(null))}
        title="Delete this post permanently?"
        description={
          <>
            “{target?.title}” will be deleted with its {plural(target?.comments ?? 0, "comment")},{" "}
            {plural(target?.votes ?? 0, "vote")} and images, and its Notion row will be archived.
            This can't be undone.
          </>
        }
        confirmLabel="Delete post"
        destructive
        onConfirm={async () => {
          if (!target) return false;
          const done = await act(
            () => adminDeletePost({ data: { postId: target.id } }),
            "Post deleted.",
          );
          if (done?.notion === "failed")
            toast.warning("The Notion row could not be queued for archiving. Remove it in Notion.");
          return done !== null;
        }}
      />
      <MergeDialog post={merging} onClose={() => setMerging(null)} />
    </>
  );
}

export function CommentModeration({
  page,
  onPage,
}: {
  page: Page<ModerationComment>;
  onPage: (page: number) => void;
}) {
  const act = useAdminAction();
  const [doomed, setDoomed] = React.useState<ModerationComment | null>(null);
  const last = React.useRef<ModerationComment | null>(null);
  if (doomed) last.current = doomed;
  const target = doomed ?? last.current;
  return (
    <>
      {page.items.length === 0 ? (
        <div className="border">
          <EmptyState
            icon={MessageSquareIcon}
            title="No comments yet"
            description="New comments show up here, newest first."
          />
        </div>
      ) : (
        <ul className="divide-y border" aria-label="Comments">
          {page.items.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:gap-5 md:p-5"
            >
              <div className="min-w-0 flex-1">
                <Markdown source={comment.body} className="space-y-2 text-sm leading-normal" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {comment.author.name} · {formatDate(comment.createdAt)} · on{" "}
                  <Link
                    to="/posts/$postId"
                    params={{ postId: comment.postId }}
                    className="underline underline-offset-4"
                  >
                    {comment.postTitle}
                  </Link>
                </p>
              </div>
              <Button
                variant="outline"
                className="h-9 shrink-0 max-md:h-11"
                onClick={() => setDoomed(comment)}
              >
                <Trash2Icon aria-hidden="true" /> Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PaginationBar page={page} onPage={onPage} />
      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(open) => (open ? undefined : setDoomed(null))}
        title="Delete this comment?"
        description={
          <>“{markdownToText(target?.body ?? "", 120)}” will be removed. This can't be undone.</>
        }
        confirmLabel="Delete comment"
        destructive
        onConfirm={async () => {
          if (!target) return false;
          const done = await act(
            () => adminDeleteComment({ data: { commentId: target.id } }),
            "Comment deleted.",
          );
          return done !== null;
        }}
      />
    </>
  );
}
