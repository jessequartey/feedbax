import startHandler, {
  createServerEntry,
} from "@tanstack/react-start/server-entry";

import {
  applyPublicCachePolicy,
  canonicalPublicRequest,
} from "./public-cache-policy";

export function createPortalServerEntry({
  connectedHandler,
  trustedFeedbackHandler,
  voteHandler,
  commentHandler,
  commentMutationHandler,
  applicationHandler = startHandler.fetch,
  cachePublicReads = true,
}: {
  connectedHandler?: (request: Request) => Promise<Response | undefined>;
  trustedFeedbackHandler: (request: Request) => Promise<Response>;
  voteHandler?: (request: Request) => Promise<Response>;
  commentHandler?: (request: Request) => Promise<Response>;
  commentMutationHandler?: (request: Request) => Promise<Response>;
  applicationHandler?: typeof startHandler.fetch;
  cachePublicReads?: boolean;
}) {
  return createServerEntry({
    async fetch(request, options) {
      const url = new URL(request.url);
      const connectedResponse = await connectedHandler?.(request);
      if (connectedResponse) return connectedResponse;
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json(
          { status: "ok" },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (request.method === "POST" && url.pathname === "/api/v1/posts") {
        return trustedFeedbackHandler(request);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/internal/votes" &&
        voteHandler
      ) {
        return voteHandler(request);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/internal/comments" &&
        commentHandler
      ) {
        return commentHandler(request);
      }
      if (
        (request.method === "PATCH" || request.method === "DELETE") &&
        url.pathname === "/internal/comments" &&
        commentMutationHandler
      ) {
        return commentMutationHandler(request);
      }
      const canonicalRequest = canonicalPublicRequest(request);
      if (canonicalRequest) {
        return Response.redirect(canonicalRequest.url, 308);
      }
      const response = await applicationHandler(request, options);
      if (!cachePublicReads) {
        const privateResponse = new Response(response.body, response);
        privateResponse.headers.set("Cache-Control", "no-store");
        privateResponse.headers.delete("Cloudflare-CDN-Cache-Control");
        privateResponse.headers.delete("Cache-Tag");
        return privateResponse;
      }
      return applyPublicCachePolicy(request, response);
    },
  });
}
