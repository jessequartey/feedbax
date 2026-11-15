import type { EmailMessage, NotifyMessage, SyncMessage } from "../contracts/sync.ts";
import { isNotifyMessage } from "../contracts/sync.ts";
import { consumeEmail } from "../email/deliver.ts";
import { notifyQueue } from "./queue.ts";
import { deliverWebhook } from "../server/webhooks.ts";

export async function consumeNotification(message: Message<NotifyMessage>): Promise<void> {
  const body = message.body;
  if (body.type !== "webhook.deliver") {
    await consumeEmail(message as Message<EmailMessage>);
    return;
  }
  // Delivery retries never touch the Notion/GitHub error state.
  try {
    const delaySeconds = await deliverWebhook(body.deliveryId);
    if (delaySeconds === null) message.ack();
    else message.retry({ delaySeconds });
  } catch {
    console.error({ type: "webhook.deliver_failed", deliveryId: body.deliveryId });
    message.retry({ delaySeconds: 60 });
  }
}

export async function consumeNotifications(batch: MessageBatch<SyncMessage>): Promise<void> {
  // Older installations deliver five notifications per invocation. One bounded email
  // slice already uses most of a Free Worker's budget; move the rest without consuming
  // their retry attempts. Ack only after the new queue accepted them.
  const [first, ...rest] = batch.messages;
  for (const message of batch.messages)
    if (!isNotifyMessage(message.body)) throw new Error("Unexpected notification message");
  for (const message of rest) {
    // Individual sends also avoid sendBatch's aggregate byte limit for rich-text events.
    await notifyQueue().send(message.body as NotifyMessage);
    message.ack();
  }
  if (first) await consumeNotification(first as Message<NotifyMessage>);
}
