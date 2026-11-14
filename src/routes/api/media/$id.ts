import { createFileRoute } from "@tanstack/react-router";
import { serveImage } from "../../../server/images.ts";
import { errorResponse } from "../../../server/http.ts";
export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await serveImage(request, params.id);
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
