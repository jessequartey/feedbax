// SERVER ONLY. Never import this file from client code: it needs your FEEDBAX_HOST_SECRET.
// Mints the single-use, 5-minute HS256 JWT that the Feedbax block sends to your portal.
// Web Crypto only, no dependencies: it runs on Node 20+, Bun, Deno and Cloudflare Workers.
import { HOST_TOKEN_HEADER, HOST_TOKEN_TTL_SECONDS, type MintOptions } from "./types";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSecret(secret: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(secret))
    throw new Error("FEEDBAX_HOST_SECRET must be base64url text");
  const standard = secret.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, "=")), (c) =>
    c.charCodeAt(0),
  );
}

/** Returns a compact JWT for the signed-in host user. Call it once per request from your own session. */
export async function mintFeedbaxToken({ secret, user, now, jti }: MintOptions): Promise<string> {
  const keyBytes = decodeSecret(secret);
  if (keyBytes.length < 16) throw new Error("FEEDBAX_HOST_SECRET is too short");
  if (!user.id || user.id.length > 200 || /[\r\n]/.test(user.id))
    throw new Error("user.id must be 1-200 characters without a newline");
  if (!user.name || user.name.length > 80) throw new Error("user.name must be 1-80 characters");

  const iat = now ?? Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    name: user.name,
    exp: iat + HOST_TOKEN_TTL_SECONDS,
    jti: jti ?? crypto.randomUUID(),
  };
  const signingInput = `${base64url(encoder.encode(HOST_TOKEN_HEADER))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
