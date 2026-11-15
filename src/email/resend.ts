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
  readonly code: string;
  readonly status: number | null;
  readonly transient: boolean;
  readonly retryAfterSeconds?: number;
  constructor(
    status: number | null,
    transient: boolean,
    retryAfterSeconds?: number,
    code?: string,
  ) {
    super(`Resend request failed${status === null ? "" : ` (${status})`}`);
    this.code = code ?? (status === null ? "network" : `http_${status}`);
    this.status = status;
    this.transient = transient;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Send one batch. `idempotencyKey` makes a retry of the same batch a no-op at Resend for
 * 24 hours. The delivery ledger skips completed sends after that window as well.
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
  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return;
  }
  // 409 can mean an identical request is still running. Read only the error name;
  // never retain or log provider messages (which can contain addresses).
  let concurrent = false;
  try {
    const body = (await response.json()) as { name?: string };
    concurrent = response.status === 409 && body.name === "concurrent_idempotent_requests";
  } catch {
    // An unreadable error body does not change the HTTP classification.
  }
  const retryAfter = Number(response.headers.get("retry-after"));
  const transient = concurrent || response.status === 429 || response.status >= 500;
  // A payload conflict is permanent. Never evade deduplication with a fresh key.
  throw new EmailError(
    response.status,
    transient,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}
