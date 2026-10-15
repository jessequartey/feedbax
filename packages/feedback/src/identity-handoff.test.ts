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

it("accepts email delivery addresses only when the trusted application signs a verified assertion", () => {
  const expected = {
    audience: claims.audience,
    issuer: claims.issuer,
    state: claims.state,
    now: 1020,
  };
  const verify = (value: Parameters<typeof signIdentityHandoff>[0]) =>
    verifyIdentityHandoff(signIdentityHandoff(value, secret), secret, expected);
  expect(
    verify({ ...claims, email: "private@example.com" }),
  ).not.toHaveProperty("email");
  expect(
    verify({ ...claims, email: "private@example.com", emailVerified: true }),
  ).toMatchObject({ email: "private@example.com", emailVerified: true });
  expect(() => verify({ ...claims, emailVerified: true })).toThrow();
  expect(() =>
    verify({
      ...claims,
      email: "bad\r\naddress@example.com",
      emailVerified: true,
    }),
  ).toThrow();
});
