import { createFileRoute } from "@tanstack/react-router";
import { handleUnsubscribe } from "../../../email/unsubscribe-route.ts";

// One-click unsubscribe (RFC 8058): the List-Unsubscribe header of every email points here.
export const Route = createFileRoute("/api/email/unsubscribe")({
  server: {
    handlers: {
      POST: ({ request }) => handleUnsubscribe(request),
      GET: ({ request }) => handleUnsubscribe(request),
    },
  },
});
