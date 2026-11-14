import handler from "@tanstack/react-start/server-entry";
import { consumeQueue, runScheduled } from "./sync/index.ts";
import type { SyncMessage } from "./contracts/sync.ts";

export default {
  fetch: (request: Request) => handler.fetch(request),
  queue: (batch, _env, _ctx) => consumeQueue(batch),
  scheduled: (controller, _env, ctx) => ctx.waitUntil(runScheduled(controller)),
} satisfies ExportedHandler<Env, SyncMessage>;
