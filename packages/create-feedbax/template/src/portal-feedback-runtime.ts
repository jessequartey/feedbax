import feedbax from "./feedbax";
import type { FeedbaxConfig } from "@feedbax/config";
import { configuredTurnstileSecret } from "./turnstile-configuration";
import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile";
import type { PortalSubmissionRateLimiter } from "./portal-feedback-submission";

interface PortalSubmissionEnvironment {
  PORTAL_SUBMISSIONS_RATE_LIMITER: PortalSubmissionRateLimiter;
  TURNSTILE_SECRET_KEY?: string;
}

interface PortalSubmissionSecurityOptions {
  turnstile?: FeedbaxConfig["turnstile"];
  environment: PortalSubmissionEnvironment;
  rateLimitKey: string;
}

interface TurnstileWarningOptions {
  turnstile?: FeedbaxConfig["turnstile"];
  environment: PortalSubmissionEnvironment;
  nodeEnv: "development" | "production" | "test";
  warn?: (message: string) => void;
}

export function createPortalSubmissionSecurity({
  turnstile = feedbax.turnstile,
  environment,
  rateLimitKey,
}: PortalSubmissionSecurityOptions) {
  const turnstileSecretKey = configuredTurnstileSecret(
    environment.TURNSTILE_SECRET_KEY,
    turnstile,
  );

  return {
    rateLimiter: environment.PORTAL_SUBMISSIONS_RATE_LIMITER,
    rateLimitKey,
    ...(turnstileSecretKey
      ? {
          turnstileVerifier: createCloudflareTurnstileVerifier({
            secretKey: turnstileSecretKey,
          }),
        }
      : {}),
  };
}

export function warnIfTurnstileDisabled({
  turnstile = feedbax.turnstile,
  nodeEnv,
  warn = console.warn,
}: TurnstileWarningOptions): void {
  if (nodeEnv === "production" && !turnstile.enabled) {
    warn(
      "WARNING: Turnstile is disabled in production; this Installation has weaker spam protection.",
    );
  }
}
