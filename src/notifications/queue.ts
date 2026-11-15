import { env } from "cloudflare:workers";
import type { NotifyMessage } from "../contracts/sync.ts";

/** Older projects keep delivering until migrate provisions the dedicated queue. */
export function notifyQueue(): Queue<NotifyMessage> {
  return env.NOTIFY_QUEUE ?? env.SYNC_QUEUE;
}
