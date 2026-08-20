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
      if (request.method === "POST" && url.pathname === "/api/v1/feedback") {
        return trustedFeedbackHandler(request);
      }
      return startHandler.fetch(request, options);
    },
  });
}
