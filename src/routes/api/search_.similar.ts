import { createFileRoute } from "@tanstack/react-router";
import { handleSearchSimilar } from "../../server/similar-posts.ts";

export const Route = createFileRoute("/api/search_/similar")({
  server: { handlers: { GET: ({ request }) => handleSearchSimilar(request) } },
});
