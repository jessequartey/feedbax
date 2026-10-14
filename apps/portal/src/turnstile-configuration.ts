import type { FeedbaxConfig } from "@feedbax/config";
import feedbax from "./feedbax";
type TurnstileConfiguration = FeedbaxConfig["turnstile"];
export function configuredTurnstileSiteKey(
  config: TurnstileConfiguration = feedbax.turnstile,
): string | undefined {
  return config.enabled ? config.siteKey : undefined;
}
export function configuredTurnstileSecret(
  secret: string | undefined,
  config: TurnstileConfiguration = feedbax.turnstile,
): string | undefined {
  if (!config.enabled) return undefined;
  if (!secret?.trim())
    throw new Error(
      "Turnstile is enabled but TURNSTILE_SECRET_KEY is missing.",
    );
  return secret.trim();
}
