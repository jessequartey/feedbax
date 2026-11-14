import { createFileRoute } from "@tanstack/react-router";
import { handleAdminEnter } from "../server/http.ts";
// The signed admin sign-in link minted by `npx feedbax admin` (src/server/admin-link.ts).
// wrangler.jsonc lists this path in assets.run_worker_first so browser navigation reaches
// the Worker instead of the SPA shell.
export const Route = createFileRoute("/admin/enter")({
  server: {
    handlers: {
      GET: ({ request }) => handleAdminEnter(request),
      POST: ({ request }) => handleAdminEnter(request),
    },
  },
});
