import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createIdentityLoginHandler } from "../examples/identity-handoff.server";
import { createFeedbackSubmissionHandler } from "../examples/feedback-submission.server";
import {
  verifyIdentityHandoff,
  createFeedbackModule,
} from "../../../packages/feedback/src/index";
import { createFeedbaxClient } from "../../../registry/default/feedbax-feedback/feedbax-client.server";
import { createTrustedFeedbackHandler } from "../../portal/src/trusted-feedback-handler";

it("the documented application endpoint issues a browser-bound handoff understood by the portal", async () => {
  const secret = "documented-identity-secret-at-least-32-characters";
  const state = "a".repeat(43);
  const options = {
    applicationOrigin: "https://app.example",
    portalOrigin: "https://feedback.example",
    issuer: "https://app.example",
    secret,
    authenticate: async () => ({
      subject: "participant-123",
      displayName: "Ama",
    }),
  };
  const handle = createIdentityLoginHandler(options);
  const request = (
    callback = "https://feedback.example/internal/identity/callback",
  ) =>
    new Request(
      `https://app.example/feedbax-login?${new URLSearchParams({ state, callback })}`,
    );
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  const token = /name="token" value="([^"]+)"/.exec(html)?.[1];
  expect(token).toBeTruthy();
  const identity = verifyIdentityHandoff(token!, secret, {
    audience: options.portalOrigin,
    issuer: options.issuer,
    state,
    now: Math.floor(Date.now() / 1000),
  });
  expect(identity.subject).toBe("participant-123");
  expect(identity.displayName).toBe("Ama");
  expect(html).not.toContain(secret);
  expect((await handle(request("https://evil.example/steal"))).status).toBe(
    400,
  );
  expect(
    (
      await createIdentityLoginHandler({
        ...options,
        authenticate: async () => null,
      })(request())
    ).status,
  ).toBe(401);
});

it("the documented feedback endpoint submits through the copied client and retries without publishing or duplicating", async () => {
  const secret = "documentation-submission-key";
  const feedback = createFeedbackModule();
  const trusted = createTrustedFeedbackHandler({
    feedback,
    apiKeyHash: createHash("sha256").update(secret).digest("base64url"),
    rateLimiter: { limit: async () => ({ success: true }) },
    limits: { maxTitleLength: 120, maxDescriptionLength: 5000 },
  });
  const client = createFeedbaxClient({
    apiBaseUrl: "https://feedback.example",
    apiSecret: secret,
    request: async (input, init) => trusted(new Request(String(input), init)),
  });
  const options = {
    applicationOrigin: "https://app.example",
    client,
    authenticate: async () => ({
      id: "user-1",
      name: "Ama",
      email: "ama@example.com",
    }),
    rateLimit: async () => true,
  };
  const handle = createFeedbackSubmissionHandler(options);
  const request = (origin = "https://app.example") =>
    new Request("https://app.example/api/feedback", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "Idempotency-Key": "stable-event-123456789",
      },
      body: JSON.stringify({
        title: "Keyboard navigation",
        description: "Make navigation available from the keyboard.",
        type: "Feature Request",
        submitter: { name: "Fake Admin", email: "fake@example.com" },
      }),
    });
  const first = await handle(request());
  expect(first.status).toBe(200);
  const result = await first.json();
  expect(result.title).toBe("Keyboard navigation");
  expect(await (await handle(request())).json()).toEqual(result);
  expect(await feedback.getPublicPost(result.slug)).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("@example.com");
  expect((await handle(request("https://evil.example"))).status).toBe(403);
  expect(
    (
      await createFeedbackSubmissionHandler({
        ...options,
        authenticate: async () => null,
      })(request())
    ).status,
  ).toBe(401);
  expect(
    (
      await createFeedbackSubmissionHandler({
        ...options,
        rateLimit: async () => false,
      })(request())
    ).status,
  ).toBe(429);
});
