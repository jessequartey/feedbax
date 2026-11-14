import { createFileRoute } from "@tanstack/react-router";
import { handleAuth } from "../../../server/http.ts";
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleAuth(request),
    },
  },
});
