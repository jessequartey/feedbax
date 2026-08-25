import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@feedbax/ui/components/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@feedbax/ui/components/drawer";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { PortalFeedbackMutations } from "./portal-feedback-form";
import { PostCreationFlow } from "./post-creation-flow";
import { useMediaQuery } from "./use-media-query";

const mobileMediaQuery = "(max-width: 720px)";

declare module "@tanstack/react-router" {
  interface HistoryState {
    createPostOverlay?: boolean;
  }
}

export function CreatePostOverlay({
  mutations,
}: {
  mutations: PortalFeedbackMutations;
}) {
  const router = useRouter();
  const overlayRequested = useRouterState({
    select: (state) => state.location.state.createPostOverlay,
  });
  const mobile = useMediaQuery(mobileMediaQuery);
  const open = overlayRequested === true;
  const close = (nextOpen: boolean) => {
    if (!nextOpen) router.history.back();
  };

  if (!open) return null;

  if (mobile) {
    return (
      <Drawer open onOpenChange={close}>
        <DrawerContent className="create-post-drawer">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Create a Post</DrawerTitle>
            <DrawerDescription>
              Share a feature request, bug report, or product observation.
            </DrawerDescription>
          </DrawerHeader>
          <PostCreationFlow
            display="overlay"
            onCancel={() => close(false)}
            mutations={mutations}
          />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="create-post-dialog">
        <DialogHeader className="sr-only">
          <DialogTitle>Create a Post</DialogTitle>
          <DialogDescription>
            Share a feature request, bug report, or product observation.
          </DialogDescription>
        </DialogHeader>
        <PostCreationFlow
          display="overlay"
          onCancel={() => close(false)}
          mutations={mutations}
        />
      </DialogContent>
    </Dialog>
  );
}
