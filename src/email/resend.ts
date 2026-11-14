// Resend over fetch (no SDK): one `POST /emails/batch` per call, at most 100 emails.
// https://resend.com/docs/api-reference/emails/send-batch-emails

export const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
export const RESEND_BATCH_MAX = 100;

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

/** A failed send. `transient` ones are retried with backoff; others are dropped and logged. */
export class EmailError extends Error {
  constructor(
    readonly status: number | null,
    readonly transient: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Resend request failed${status === null ? "" : ` (${status})`}`);
  }
}

/**
 * Send one batch. `idempotencyKey` makes a retry of the same batch a no-op at Resend for
 * 24 hours, so a message retried after a partial delivery never emails anyone twice.
 */
export async function sendBatch(
  apiKey: string,
  emails: OutgoingEmail[],
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!emails.length) return;
  if (emails.length > RESEND_BATCH_MAX) throw new Error("Too many emails in one batch");
  let response: Response;
  try {
    response = await fetcher(RESEND_BATCH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(emails.map((email) => ({ ...email, to: [email.to] }))),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new EmailError(null, true);
  }
  // Drain the body so the connection is released; its content is never logged.
  await response.body?.cancel().catch(() => undefined);
  if (response.ok) return;
  const retryAfter = Number(response.headers.get("retry-after"));
  const transient = response.status === 429 || response.status >= 500;
  // 409: the same key with a different payload (the audience changed between attempts) or
  // a concurrent attempt. Either way this batch was, or is being, sent: do not retry.
  throw new EmailError(
    response.status,
    transient,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}
