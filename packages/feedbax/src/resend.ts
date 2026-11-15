import { CliError } from "../../create-feedbax/src/flags.ts";

/** Authenticate without sending email or changing provider resources. */
export async function validateResendKey(key: string, fetcher: typeof fetch): Promise<void> {
  if (!/^re_[A-Za-z0-9_]{20,}$/.test(key))
    throw new CliError("RESEND_API_KEY must be a Resend API key (re_…).", 2);
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    throw new CliError(
      "Could not reach Resend to validate RESEND_API_KEY. Check your connection and retry.",
    );
  }
  const body = (await response.json().catch(() => null)) as { name?: string } | null;
  // Sending-only keys are authenticated but cannot list domains.
  if (!response.ok && !(response.status === 401 && body?.name === "restricted_api_key"))
    throw new CliError("Resend could not validate RESEND_API_KEY. Check the key and retry.", 2);
}
