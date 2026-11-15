import * as React from "react";
import { isNotFound, isRedirect, Link, useRouter } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadPost } from "./load-post";
import { PostDetailSkeleton, PostDetailView } from "./post-detail";
import { ErrorState, NotFoundState } from "./states";
import { SubmitForm } from "./submit-form";

type PostData = Awaited<ReturnType<typeof loadPost>>;

function DialogPost({ postId }: { postId: string }) {
  const router = useRouter();
  const [result, setResult] = React.useState<PostData | "error" | "notFound" | null>(null);
  const [attempt, retry] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    let current = true;
    setResult(null);
    void loadPost(postId).then(
      (data) => {
        if (current) setResult(data);
      },
      (error: unknown) => {
        if (!current) return;
        if (isRedirect(error)) void router.navigate(error.options);
        else setResult(isNotFound(error) ? "notFound" : "error");
      },
    );
    return () => {
      current = false;
    };
  }, [postId, attempt, router]);

  if (!result) return <PostDetailSkeleton />;
  if (result === "error") return <ErrorState onRetry={retry} />;
  if (result === "notFound")
    return (
      <NotFoundState
        title="Post not found"
        description="This post doesn't exist, or it was removed."
      />
    );
  return <PostDetailView post={result.post} comments={result.comments} inDialog />;
}

export default function ListDialog({ dialog }: { dialog: string }) {
  const router = useRouter();
  const submit = dialog === "submit";
  const heading = React.useRef<HTMLHeadingElement>(null);
  // Rows explicitly focus their anchor on click, including browsers that don't do so on touch.
  const [returnFocus] = React.useState(() => ({
    current: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.history.back();
      }}
    >
      <DialogContent
        initialFocus={heading}
        finalFocus={returnFocus}
        className="flex h-dvh max-h-dvh max-w-full flex-col gap-0 overflow-hidden p-0 text-sm sm:h-auto sm:max-h-[90dvh] sm:max-w-5xl"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6">
          <DialogTitle ref={heading} tabIndex={-1} className="text-base outline-none">
            {submit ? "Create post" : "Feedback"}
          </DialogTitle>
          <DialogDescription>
            {submit
              ? "Share an idea, report a bug, or leave feedback."
              : "Read, vote and join the conversation."}
          </DialogDescription>
          <Link
            {...(submit
              ? { to: "/submit" as const }
              : { to: "/posts/$postId" as const, params: { postId: dialog } })}
            replace
            className={buttonVariants({
              variant: "link",
              className: "mt-1 h-9 w-fit justify-start p-0",
            })}
          >
            <ExternalLinkIcon aria-hidden="true" /> Open full page
          </Link>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {submit ? (
            <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
              <SubmitForm />
            </div>
          ) : (
            <DialogPost postId={dialog} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
