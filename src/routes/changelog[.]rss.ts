import { createFileRoute } from "@tanstack/react-router";
import { handleChangelogFeed } from "../server/changelog-feed.ts";

// RSS 2.0 of the published changelog. wrangler.jsonc lists this path in
// assets.run_worker_first so a browser or feed reader reaches the Worker instead of the SPA shell.
export const Route = createFileRoute("/changelog.rss")({
  server: { handlers: { GET: ({ request }) => handleChangelogFeed(request) } },
});
