// W0 stub. W2 owns this file from handoff onward.
import type { SyncMessage } from "../contracts/sync.ts";

export async function consumeQueue(_batch: MessageBatch<SyncMessage>): Promise<void> {
  throw new Error("not implemented: W2");
}

export async function runScheduled(_controller: ScheduledController): Promise<void> {
  throw new Error("not implemented: W2");
}
