import { createFileRoute } from "@tanstack/react-router";
import { handlePosts } from "../../server/http.ts";
export const Route = createFileRoute("/api/posts")({
  server: {
    handlers: {
      POST: ({ request }) => handlePosts(request),
      OPTIONS: ({ request }) => handlePosts(request),
    },
  },
});
