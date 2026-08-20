import startHandler, {
  createServerEntry,
} from "@tanstack/react-start/server-entry";

export function createPortalServerEntry({
  trustedFeedbackHandler,
}: {
  trustedFeedbackHandler: (request: Request) => Promise<Response>;
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
      if (request.method === "POST" && url.pathname === "/api/v1/feedback") {
        return trustedFeedbackHandler(request);
      }
      return startHandler.fetch(request, options);
    },
  });
}
