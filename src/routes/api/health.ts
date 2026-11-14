import { createFileRoute } from "@tanstack/react-router";
import { handleHealth } from "../../server/http.ts";
export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: () => handleHealth() } },
});
