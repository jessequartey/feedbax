import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicPortalError } from "./public-portal-error";
import {
  ActionablePortalFailure,
  runSafePortalMutation,
  runSafePublicRead,
} from "./safe-public-failure";

describe("public portal failure state", () => {
  it("replaces private upstream diagnostics at the public read boundary", async () => {
    const privateFailure = new Error(
      "Notion token secret-token and property private-field",
    );

    const failure = await runSafePublicRead(async () =>
      Promise.reject(privateFailure),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Public feedback is temporarily unavailable.",
    );
    expect((failure as Error).message).not.toContain("secret-token");
  });

  it("renders an explicit retry state without serializing private failure details", () => {
    const privateFailure = new Error(
      "Notion token secret-token, property private-field, Browser Capability private-capability",
    );

    const html = renderToStaticMarkup(
      <PublicPortalError error={privateFailure} reset={() => undefined} />,
    );

    expect(html).toContain("Feedback is temporarily unavailable");
    expect(html).toContain("Try again");
    expect(html).not.toContain("secret-token");
    expect(html).not.toContain("private-field");
    expect(html).not.toContain("private-capability");
  });

  it("preserves actionable portal failures while replacing private mutation diagnostics", async () => {
    await expect(
      runSafePortalMutation(async () => {
        throw new ActionablePortalFailure(
          "Feedback submission rate limit exceeded.",
        );
      }),
    ).rejects.toThrow("Feedback submission rate limit exceeded.");

    const failure = await runSafePortalMutation(async () => {
      throw new Error("Notion private diagnostic secret-token");
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Public feedback mutation is temporarily unavailable.",
    );
    expect((failure as Error).message).not.toContain("secret-token");
  });
});
