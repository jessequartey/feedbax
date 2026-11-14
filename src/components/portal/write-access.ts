import type { Viewer } from "@/contracts/portal";

export type WriteDecision = "ok" | "anonymous" | "login";

/** What a write needs first: nothing, a lazily created anonymous session, or a real sign-in. */
export function decideWrite(viewer: Viewer): WriteDecision {
  const { user, config } = viewer;
  if (user && (user.kind !== "anonymous" || config.anonymous)) return "ok";
  return config.anonymous && !user ? "anonymous" : "login";
}

/** "Back to app" is only for host identities, and only when `appUrl` is configured. */
export function backToAppUrl(viewer: Viewer): string | null {
  return viewer.config.appUrl && viewer.user?.kind === "host" ? viewer.config.appUrl : null;
}
