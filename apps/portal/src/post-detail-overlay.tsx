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
import { type ReactNode } from "react";
import { useMediaQuery } from "./use-media-query";

declare module "@tanstack/react-router" {
  interface HistoryState {
    postDetailOverlay?: { slug: string };
  }
}

export function PostDetailOverlay({
  renderDetail,
}: {
  renderDetail: (slug: string) => ReactNode;
}) {
  const router = useRouter();
  const request = useRouterState({
    select: (state) => state.location.state.postDetailOverlay,
  });
  const mobile = useMediaQuery("(max-width: 720px)");
  const close = (open: boolean) => {
    if (!open) router.history.back();
  };

  if (!request) return null;
  const detail = renderDetail(request.slug);

  if (mobile) {
    return (
      <Drawer open onOpenChange={close}>
        <DrawerContent className="post-detail-drawer">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Post details</DrawerTitle>
            <DrawerDescription>View and manage this Post.</DrawerDescription>
          </DrawerHeader>
          {detail}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="post-detail-dialog">
        <DialogHeader className="sr-only">
          <DialogTitle>Post details</DialogTitle>
          <DialogDescription>View and manage this Post.</DialogDescription>
        </DialogHeader>
        {detail}
      </DialogContent>
    </Dialog>
  );
}
