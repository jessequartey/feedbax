import startHandler, {
  createServerEntry,
} from "@tanstack/react-start/server-entry";

import {
  applyPublicCachePolicy,
  canonicalPublicRequest,
} from "./public-cache-policy";

export function createPortalServerEntry({
  trustedFeedbackHandler,
  voteHandler,
  applicationHandler = startHandler.fetch,
}: {
  trustedFeedbackHandler: (request: Request) => Promise<Response>;
  voteHandler?: (request: Request) => Promise<Response>;
  applicationHandler?: typeof startHandler.fetch;
}) {
  return createServerEntry({
    async fetch(request, options) {
      const url = new URL(request.url);
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
      const canonicalRequest = canonicalPublicRequest(request);
      if (canonicalRequest) {
        return Response.redirect(canonicalRequest.url, 308);
      }
      const response = await applicationHandler(request, options);
      return applyPublicCachePolicy(request, response);
    },
  });
}
