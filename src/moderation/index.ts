import type { ModerationSettings } from "../contracts/admin.ts";
import type { ModerationProvider, ModerationResult } from "./types.ts";
import { wordListProvider } from "./word-list.ts";
export type { ModerationProvider, ModerationResult } from "./types.ts";

/** Future providers use this same bounded, fail-open boundary. Never log text or exceptions. */
export async function checkModeration(
  text: string,
  settings: ModerationSettings,
  admin = false,
  provider?: ModerationProvider,
  timeoutMs = 250,
): Promise<ModerationResult> {
  if (admin || settings.mode === "off") return { verdict: "allow", reasons: [] };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() =>
        (provider ?? wordListProvider(settings.blockedWords, settings.allowedWords)).check(
          text,
          controller.signal,
        ),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("moderation timeout"));
        }, timeoutMs);
      }),
    ]);
    if (
      !["allow", "flag", "block"].includes(result.verdict) ||
      !Array.isArray(result.reasons) ||
      !result.reasons.every((reason) => typeof reason === "string")
    )
      throw new Error("invalid moderation response");
    return result.verdict === "allow"
      ? { verdict: "allow", reasons: [] }
      : { verdict: settings.mode, reasons: result.reasons };
  } catch {
    console.warn({ type: "moderation.failure", action: "allow" });
    return { verdict: "allow", reasons: [] };
  } finally {
    clearTimeout(timer);
  }
}
