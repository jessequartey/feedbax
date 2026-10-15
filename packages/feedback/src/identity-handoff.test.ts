import { expect, it } from "vitest";
import { signIdentityHandoff, verifyIdentityHandoff } from "./identity-handoff";
const secret = "test-secret-for-identity-handoff-32-bytes";
const claims = {
  subject: "alice",
  displayName: "Alice",
  audience: "https://feedback.example",
  issuer: "https://app.example",
  state: "browser-state",
  nonce: "unique-nonce",
  issuedAt: 1000,
  expiresAt: 1100,
};
it("accepts only a signed identity bound to this Installation, browser and time", () => {
  const token = signIdentityHandoff(claims, secret);
  expect(
    verifyIdentityHandoff(token, secret, {
      audience: claims.audience,
      issuer: claims.issuer,
      state: claims.state,
      now: 1020,
    }),
  ).toEqual(claims);
  expect(() =>
    verifyIdentityHandoff(token, secret, {
      audience: "https://other.example",
      issuer: claims.issuer,
      state: claims.state,
      now: 1020,
    }),
  ).toThrow();
  expect(() =>
    verifyIdentityHandoff(token, secret, {
      audience: claims.audience,
      issuer: claims.issuer,
      state: "different-browser",
      now: 1020,
    }),
  ).toThrow();
  expect(() =>
    verifyIdentityHandoff(token, secret, {
      audience: claims.audience,
      issuer: claims.issuer,
      state: claims.state,
      now: 1101,
    }),
  ).toThrow();
  expect(() =>
    verifyIdentityHandoff(token + "x", secret, {
      audience: claims.audience,
      issuer: claims.issuer,
      state: claims.state,
      now: 1020,
    }),
  ).toThrow();
});
