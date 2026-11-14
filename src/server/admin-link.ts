// Signed, single-use admin sign-in links. No setup step: the key is derived from the
// existing BETTER_AUTH_SECRET, so no new secret binding is needed.
//
// This module is deliberately pure (Web Crypto + string handling only, no
// `cloudflare:workers`, D1 or Better Auth imports) so it runs unchanged in Node 24.
// `npx feedbax admin` (packages/feedbax) imports `mintAdminLink` and mints locally:
//   - secret:    BETTER_AUTH_SECRET from the project's .dev.vars. create-feedbax generates
//                that value once and deploys the same value as the Worker secret.
//   - portalUrl: `vars.PORTAL_URL` from wrangler.jsonc (NOT .dev.vars, which is localhost).
// The Worker verifies the link at /admin/enter and consumes its nonce once in D1
// (`consumeAdminNonce` in src/server/admin.ts).
//
// Token: `<nonce>.<exp>.<sig>`; nonce = 16 random bytes (base64url), exp = epoch seconds,
// sig = HMAC-SHA256(K, "<nonce>.<exp>") where K = HMAC-SHA256(secret, ADMIN_LINK_CONTEXT).
// The derived K keeps these signatures separate from Better Auth's own use of the secret.

export const ADMIN_LINK_PATH = "/admin/enter";
export const ADMIN_LINK_TTL_SECONDS = 15 * 60;
/** A laptop clock running ahead of the Worker may push `exp` this far past the TTL. */
export const ADMIN_LINK_MAX_SKEW_SECONDS = 5 * 60;
const ADMIN_LINK_CONTEXT = "feedbax/admin-link/v1";
const TOKEN = /^([A-Za-z0-9_-]{22})\.([1-9]\d{0,11})\.([A-Za-z0-9_-]{43})$/;
const NONCE = /^[A-Za-z0-9_-]{22}$/;

export type AdminLinkClaims = { nonce: string; exp: number };
export type MintAdminLinkOptions = {
  /** BETTER_AUTH_SECRET (at least 32 characters). */
  secret: string;
  /** The deployed portal origin, e.g. https://feedback.example.com. */
  portalUrl: string;
  /** Epoch seconds; tests only. */
  now?: number;
  /** 22-char base64url nonce; tests only. */
  nonce?: string;
};
export type AdminLink = { url: string; token: string; expiresAt: number };

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
async function signingKey(secret: string): Promise<CryptoKey> {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Invalid BETTER_AUTH_SECRET");
  const encoder = new TextEncoder();
  const root = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(ADMIN_LINK_CONTEXT));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Mint a 15-minute admin sign-in link. Deterministic when `now` and `nonce` are given. */
export async function mintAdminLink(options: MintAdminLinkOptions): Promise<AdminLink> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? base64url(crypto.getRandomValues(new Uint8Array(16)));
  if (!NONCE.test(nonce)) throw new Error("Invalid admin link nonce");
  const exp = now + ADMIN_LINK_TTL_SECONDS;
  const key = await signingKey(options.secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${nonce}.${exp}`),
  );
  const token = `${nonce}.${exp}.${base64url(new Uint8Array(signature))}`;
  const url = new URL(ADMIN_LINK_PATH, options.portalUrl);
  url.searchParams.set("t", token);
  return { url: url.toString(), token, expiresAt: exp };
}

/**
 * Check signature and expiry only; it does not consume the nonce. Returns null for any
 * malformed, tampered, expired or implausibly far-future token. Throws only when the
 * secret itself is unusable (a configuration error, not a bad link).
 */
export async function verifyAdminToken(
  token: unknown,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): Promise<AdminLinkClaims | null> {
  const key = await signingKey(secret);
  if (typeof token !== "string") return null;
  const match = TOKEN.exec(token);
  if (!match) return null;
  const [, nonce, expText, signature] = match;
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp)) return null;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = Uint8Array.from(
      atob(signature.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
  } catch {
    return null;
  }
  // Reject non-canonical encodings so one signature has exactly one spelling.
  if (signatureBytes.length !== 32 || base64url(signatureBytes) !== signature) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(`${nonce}.${exp}`),
  );
  if (!valid) return null;
  if (exp < now || exp > now + ADMIN_LINK_TTL_SECONDS + ADMIN_LINK_MAX_SKEW_SECONDS) return null;
  return { nonce, exp };
}
