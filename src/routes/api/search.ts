import { createFileRoute } from "@tanstack/react-router";
import { handleSearch } from "../../server/search.ts";

export const Route = createFileRoute("/api/search")({
  server: { handlers: { GET: ({ request }) => handleSearch(request) } },
});
