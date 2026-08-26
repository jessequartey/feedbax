import { describe, expect, it, vi } from "vitest";

import { warnIfTurnstileDisabled } from "./portal-feedback-runtime";

describe("portal feedback submission security configuration", () => {
  it("warns prominently only in production when Turnstile is disabled", () => {
    const localWarning = vi.fn();
    const productionWarning = vi.fn();
    const rateLimiter = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };

    warnIfTurnstileDisabled({
      environment: { PORTAL_SUBMISSIONS_RATE_LIMITER: rateLimiter },
      nodeEnv: "development",
      warn: localWarning,
    });
    warnIfTurnstileDisabled({
      environment: { PORTAL_SUBMISSIONS_RATE_LIMITER: rateLimiter },
      nodeEnv: "production",
      warn: productionWarning,
    });

    expect(localWarning).not.toHaveBeenCalled();
    expect(productionWarning).toHaveBeenCalledOnce();
    expect(productionWarning).toHaveBeenCalledWith(
      "WARNING: Turnstile is disabled in production; this Installation has weaker spam protection.",
    );
  });
});
