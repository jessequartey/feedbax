import { env } from "cloudflare:workers";
import { boundedBody, MULTIPART_BYTES, requireSameOrigin } from "./server/request.ts";
import { errorResponse } from "./server/http.ts";
import { handleGitHubWebhook } from "./server/github-webhook.ts";
import handler from "@tanstack/react-start/server-entry";
import { consumeQueue, runScheduled } from "./sync/index.ts";
import { consumeNotifications } from "./notifications/consume.ts";
import type { SyncMessage } from "./contracts/sync.ts";

export default {
  fetch: async (request: Request) => {
    try {
      if (new URL(request.url).pathname === "/api/webhooks/github")
        return await handleGitHubWebhook(request);
      // The bearer route bounds its own stream after origin/auth checks and adds CORS
      // to size errors. Start does not parse server-route bodies before dispatch.
      if (
        new URL(request.url).pathname !== "/api/posts" &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method)
      ) {
        if (new URL(request.url).pathname.startsWith("/_serverFn/"))
          requireSameOrigin(request, env.PORTAL_URL);
        const max = request.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("multipart/form-data;")
          ? MULTIPART_BYTES
          : 256 * 1024;
        const body = await boundedBody(request, max);
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        request = new Request(request, { method: request.method, headers, body });
      }
      return await handler.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  },
  queue: (batch, _env, _ctx) =>
    batch.queue.endsWith("-notify") ? consumeNotifications(batch) : consumeQueue(batch),
  scheduled: (controller, _env, ctx) => ctx.waitUntil(runScheduled(controller)),
} satisfies ExportedHandler<Env, SyncMessage>;
