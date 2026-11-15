import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import type { ApiError } from "@/contracts/domain";
import type { Viewer } from "@/contracts/portal";
import { authClient } from "@/lib/auth-client";
import { loginHref } from "./safe-path";
import { decideWrite } from "./write-access";

const ViewerContext = React.createContext<Viewer | null>(null);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: Viewer;
  children: React.ReactNode;
}) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = React.useContext(ViewerContext);
  if (!viewer) throw new Error("useViewer must be used inside <ViewerProvider>");
  return viewer;
}

/**
 * Every write goes through `ensureWriter()` first:
 *  - signed in: continues;
 *  - anonymous mode: creates the anonymous session just in time;
 *  - otherwise: sends the person to /login?to=<this page> and returns false.
 */
export function useWriteGate() {
  const viewer = useViewer();
  const router = useRouter();

  const goToLogin = React.useCallback(() => {
    const location = router.state.location;
    router.history.push(loginHref((location.maskedLocation ?? location).href));
  }, [router]);

  const ensureWriter = React.useCallback(async (): Promise<boolean> => {
    const decision = decideWrite(viewer);
    if (decision === "ok") return true;
    if (decision === "login") {
      goToLogin();
      return false;
    }
    const result = await authClient.signIn.anonymous();
    if (result.error) {
      toast.error("Couldn't start a session. Please try again.");
      return false;
    }
    await router.invalidate();
    return true;
  }, [viewer, router, goToLogin]);

  /** Shows a write error. A lost session sends the person to sign in instead. */
  const reportError = React.useCallback(
    (error: ApiError) => {
      if (error.code === "unauthenticated") {
        toast.error("Please sign in to continue.");
        goToLogin();
        return;
      }
      toast.error(error.message || "Something went wrong. Please try again.");
    },
    [goToLogin],
  );

  return { ensureWriter, reportError, viewer };
}
