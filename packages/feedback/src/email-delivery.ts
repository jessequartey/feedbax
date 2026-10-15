export interface NotificationEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  headers: Record<string, string>;
}
export type EmailSender = (
  message: NotificationEmail,
  deliveryKey: string,
) => Promise<void>;
export type CloudflareEmailBinding = {
  send(message: NotificationEmail): Promise<unknown>;
};

/** The custom endpoint accepts the same JSON message as Resend and must honor Idempotency-Key. */
export function createEmailSender(
  options:
    | { provider: "cloudflare"; binding: CloudflareEmailBinding }
    | { provider: "resend"; token: string; request?: typeof fetch }
    | {
        provider: "custom";
        url: string;
        token: string;
        request?: typeof fetch;
      },
): EmailSender {
  if (options.provider === "cloudflare")
    return async (message) => {
      await options.binding.send(message);
    };
  const url =
    options.provider === "resend"
      ? "https://api.resend.com/emails"
      : options.url;
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error(
      "Email sender requires an HTTPS endpoint without credentials or fragments.",
    );
  if (!options.token.trim()) throw new Error("Email sender secret is missing.");
  return async (message, deliveryKey) => {
    const response = await (options.request ?? fetch)(url, {
      method: "POST",
      // Workers supports manual/follow; manual also prevents forwarding credentials.
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": deliveryKey,
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Email provider did not accept this delivery.");
    }
    await response.body?.cancel();
  };
}
