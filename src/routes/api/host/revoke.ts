import { createFileRoute } from "@tanstack/react-router";
import { handleHostRevoke } from "../../../server/http.ts";
export const Route = createFileRoute("/api/host/revoke")({
  server: { handlers: { POST: ({ request }) => handleHostRevoke(request) } },
});
