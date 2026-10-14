import { describe, expect, it } from "vitest";
import {
  configuredTurnstileSecret,
  configuredTurnstileSiteKey,
} from "./turnstile-configuration";
describe("typed Turnstile configuration", () => {
  it("uses the public typed site key without a Vite environment variable", () => {
    expect(
      configuredTurnstileSiteKey({
        enabled: true,
        siteKey: "configured-public-key",
      }),
    ).toBe("configured-public-key");
  });
  it("disables browser widgets and server verification together even when a secret remains", () => {
    expect(
      configuredTurnstileSiteKey({ enabled: false, siteKey: "old-key" }),
    ).toBeUndefined();
    expect(
      configuredTurnstileSecret("retained-secret", { enabled: false }),
    ).toBeUndefined();
  });
  it("fails closed when enabled verification lacks its secret", () => {
    expect(() =>
      configuredTurnstileSecret(undefined, {
        enabled: true,
        siteKey: "public-key",
      }),
    ).toThrow("TURNSTILE_SECRET_KEY is missing");
    expect(
      configuredTurnstileSecret(" private-secret ", {
        enabled: true,
        siteKey: "public-key",
      }),
    ).toBe("private-secret");
  });
});
