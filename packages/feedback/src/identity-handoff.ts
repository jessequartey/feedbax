import { createHmac, timingSafeEqual } from "node:crypto";

export interface IdentityHandoff {
  email?: string;
  emailVerified?: boolean;
  subject: string;
  displayName: string;
  issuer: string;
  audience: string;
  state: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}
export function signIdentityHandoff(
  claims: IdentityHandoff,
  secret: string,
): string {
  requireSecret(secret);
  const payload = Buffer.from(
    JSON.stringify({ purpose: "feedbax-identity-v1", ...claims }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function verifyIdentityHandoff(
  token: string,
  secret: string,
  expected: { audience: string; issuer: string; state: string; now: number },
): IdentityHandoff {
  requireSecret(secret);
  if (token.length > 8192) throw invalid();
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra) throw invalid();
  const received = Buffer.from(mac);
  const wanted = Buffer.from(signature(payload, secret));
  if (wanted.length !== received.length || !timingSafeEqual(wanted, received))
    throw invalid();
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!value || value.purpose !== "feedbax-identity-v1") throw invalid();
  for (const key of [
    "subject",
    "displayName",
    "issuer",
    "audience",
    "state",
    "nonce",
  ])
    if (
      typeof value[key] !== "string" ||
      !value[key].trim() ||
      value[key].length > 512
    )
      throw invalid();
  if (
    value.audience !== expected.audience ||
    value.issuer !== expected.issuer ||
    value.state !== expected.state ||
    !expected.state ||
    !Number.isSafeInteger(value.issuedAt) ||
    !Number.isSafeInteger(value.expiresAt)
  )
    throw invalid();
  const issuedAt = Number(value.issuedAt),
    expiresAt = Number(value.expiresAt);
  if (
    issuedAt > expected.now + 30 ||
    expiresAt <= expected.now ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 120
  )
    throw invalid();
  if (
    value.emailVerified !== undefined &&
    typeof value.emailVerified !== "boolean"
  )
    throw invalid();
  if (
    value.email !== undefined &&
    (typeof value.email !== "string" ||
      value.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))
  )
    throw invalid();
  if (value.emailVerified === true && !value.email) throw invalid();
  return {
    ...(value.emailVerified === true
      ? { email: String(value.email), emailVerified: true }
      : {}),
    subject: String(value.subject),
    displayName: String(value.displayName),
    issuer: String(value.issuer),
    audience: String(value.audience),
    state: String(value.state),
    nonce: String(value.nonce),
    issuedAt,
    expiresAt,
  };
}
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`feedbax-identity-v1:${payload}`)
    .digest("base64url");
}
function requireSecret(secret: string) {
  if (secret.length < 32)
    throw new Error(
      "Identity handoff secret must contain at least 32 characters.",
    );
}
function invalid() {
  return new Error(
    "Identity handoff is invalid or expired. Start sign-in again.",
  );
}
