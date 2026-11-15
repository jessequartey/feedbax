import type { EmailMessage, NotifyMessage, SyncMessage } from "../contracts/sync.ts";
import { isNotifyMessage } from "../contracts/sync.ts";
import { consumeEmail } from "../email/deliver.ts";
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
  for (const message of batch.messages) {
    if (!isNotifyMessage(message.body)) throw new Error("Unexpected notification message");
    await consumeNotification(message as Message<NotifyMessage>);
  }
}
