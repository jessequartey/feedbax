/** Small delivery batches keep external-service latency away from sync. */
export function notificationConsumer(queue: string) {
  return { queue, max_batch_size: 5, max_concurrency: 3, max_retries: 5 };
}
