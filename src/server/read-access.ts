import type { ViewerUser } from "../contracts/domain.ts";

/** Only static UI files and identity entry points bypass private-board authorization. */
export function isReadAccessExempt(path: string): boolean {
  return (
    isStaticAsset(path) ||
    path.startsWith("/api/auth/") ||
    path === "/admin/enter" ||
    path === "/api/health" ||
    path === "/api/webhooks/github" ||
    // The host server ends a user's session with a single-use host token, never a cookie.
    path === "/api/host/revoke"
  );
}

/** Static files the Worker hands to the assets binding when `assets.run_worker_first` is true. */
export function isStaticAsset(path: string): boolean {
  return (
    path.startsWith("/assets/") ||
    ["/favicon.svg", "/favicon.ico", "/logo.svg", "/og.png"].includes(path)
  );
}

export async function enforceReadAccess(
  request: Request,
  settings: { auth: { private?: boolean }; appUrl: string | null },
  viewer: () => Promise<ViewerUser | null>,
): Promise<Response | null> {
  if (!settings.auth.private || isReadAccessExempt(new URL(request.url).pathname)) return null;
  // The multipart endpoint independently verifies a single-use host token (also for OPTIONS).
  if (
    new URL(request.url).pathname === "/api/posts" &&
    ["POST", "OPTIONS"].includes(request.method)
  )
    return null;
  const user = await viewer();
  if (user && user.kind !== "anonymous" && !user.banned) return null;
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (request.headers.get("accept")?.includes("text/html"))
    return new Response(null, {
      status: 302,
      headers: { ...headers, Location: "/api/auth/feedbax/required" },
    });
  return Response.json(
    {
      error: {
        code: "unauthenticated",
        message: "Sign in through the host app to read this board.",
      },
    },
    { status: 401, headers },
  );
}

/** No private response (including media and RSS) may enter a shared or browser cache. */
export function privateResponse(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", [response.headers.get("Vary"), "Cookie"].filter(Boolean).join(", "));
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}
