import type { DraftPost } from "@feedbax/feedback";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@feedbax/ui/components/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@feedbax/ui/components/dropdown-menu";
import { Badge } from "@feedbax/ui/components/badge";
import { Button } from "@feedbax/ui/components/button";
import { toast } from "sonner";

import {
  PortalFeedbackForm,
  type PortalFeedbackMutations,
} from "./portal-feedback-form";
import { readCapabilities, removeCapability } from "./browser-post-state";
import {
  editPortalFeedbackDraft,
  getPortalDraftPost,
  submitPortalPost,
  withdrawPortalFeedbackDraft,
} from "./portal-feedback-server-function";
import { PublicPostUnavailable } from "./public-post-unavailable";
import { isCapabilityAuthorizationFailure } from "./capability-authorization-error";
import { PublicPostDetail } from "./public-post-detail";

export function AuthorizedDraftPost({ slug }: { slug: string }) {
  const [post, setPost] = useState<DraftPost | null>();
  const [editing, setEditing] = useState(false);
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const overlaid = useRouterState({
    select: (state) => Boolean(state.location.state.postDetailOverlay),
  });
  const capability = Object.values(readCapabilities(localStorage)).find(
    (item) => item.slug === slug,
  );

  useEffect(() => {
    setPost(undefined);
    if (!capability) {
      setPost(null);
      return;
    }
    getPortalDraftPost({ data: capability })
      .then(setPost)
      .catch((error: unknown) => {
        if (isCapabilityAuthorizationFailure(error)) {
          removeCapability(localStorage, capability.id);
        }
        setPost(null);
      });
  }, [capability?.browserCapability, capability?.id, slug]);

  if (post === undefined)
    return (
      <main className="feedback-detail">
        <p>Loading Draft Post…</p>
      </main>
    );
  if (post === null || !capability) return <PublicPostUnavailable />;

  const updateVisibleDraft = (
    edited: Awaited<ReturnType<PortalFeedbackMutations["editDraftPost"]>>,
  ) => {
    const next = { ...post, ...edited, slug: post.slug };
    setPost(next);
    setEditing(false);
    queryClient.setQueriesData<DraftPost[]>(
      { queryKey: ["authorized-draft-posts"] },
      (current) => current?.map((item) => (item.id === next.id ? next : item)),
    );
    toast.success("Draft updated.");
  };

  const withdraw = async () => {
    setWithdrawalError(undefined);
    try {
      await withdrawPortalFeedbackDraft({ data: capability });
      removeCapability(localStorage, post.id);
      queryClient.setQueriesData<DraftPost[]>(
        { queryKey: ["authorized-draft-posts"] },
        (current) => current?.filter((item) => item.id !== post.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["public-posts"] });
      if (overlaid) router.history.back();
      else await navigate({ to: "/" });
    } catch (error) {
      if (isCapabilityAuthorizationFailure(error)) {
        removeCapability(localStorage, post.id);
        setPost(null);
      } else {
        setWithdrawalError(
          "The draft could not be withdrawn. Please try again.",
        );
      }
    } finally {
      setConfirmingWithdrawal(false);
    }
  };

  return (
    <>
      {editing ? (
        <main className="feedback-detail">
          <PortalFeedbackForm
            display="overlay"
            onCancel={() => setEditing(false)}
            onEdited={updateVisibleDraft}
            onAuthorizationLost={() => {
              removeCapability(localStorage, post.id);
              setPost(null);
            }}
            showWithdrawal={false}
            mutations={{
              submitPost: submitPortalPost,
              editDraftPost: editPortalFeedbackDraft,
              withdrawDraftPost: withdrawPortalFeedbackDraft,
            }}
            initialDraft={{
              id: post.id,
              browserCapability: capability.browserCapability,
              title: post.title,
              description: post.description,
              type: post.type,
            }}
          />
        </main>
      ) : (
        <PublicPostDetail
          post={post}
          display={overlaid ? "overlay" : "page"}
          features={{ voting: false, comments: false, changelog: true }}
          summaryMarker={<Badge variant="outline">Draft</Badge>}
          summaryActions={
            <>
              <div className="draft-detail-actions">
                <Button type="button" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Draft actions"
                    render={
                      <Button type="button" variant="ghost" size="icon" />
                    }
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setConfirmingWithdrawal(true)}
                    >
                      Withdraw draft
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {withdrawalError ? <p role="alert">{withdrawalError}</p> : null}
            </>
          }
        />
      )}
      <AlertDialog
        open={confirmingWithdrawal}
        onOpenChange={setConfirmingWithdrawal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Withdraw this Draft Post permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={withdraw}>
              Withdraw Draft Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
