import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile";
import type { PortalSubmissionRateLimiter } from "./portal-feedback-submission";

interface PortalSubmissionEnvironment {
  PORTAL_SUBMISSIONS_RATE_LIMITER: PortalSubmissionRateLimiter;
  TURNSTILE_SECRET_KEY?: string;
}

interface PortalSubmissionSecurityOptions {
  environment: PortalSubmissionEnvironment;
  rateLimitKey: string;
}

interface TurnstileWarningOptions {
  environment: PortalSubmissionEnvironment;
  nodeEnv: "development" | "production" | "test";
  warn?: (message: string) => void;
}

export function createPortalSubmissionSecurity({
  environment,
  rateLimitKey,
}: PortalSubmissionSecurityOptions) {
  const turnstileSecretKey = environment.TURNSTILE_SECRET_KEY?.trim();

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
  environment,
  nodeEnv,
  warn = console.warn,
}: TurnstileWarningOptions): void {
  if (nodeEnv === "production" && !environment.TURNSTILE_SECRET_KEY?.trim()) {
    warn(
      "WARNING: Turnstile is disabled in production; this Installation has weaker spam protection.",
    );
  }
}
