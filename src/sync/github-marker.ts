import { decode64, encode64 } from "../server/encoding.ts";
import { config, env, portalUrl } from "./shared.ts";

function payload(postId: string) {
  return new TextEncoder().encode(
    JSON.stringify([
      "feedbax-github-v1",
      portalUrl(),
      config.integrations.github && config.integrations.github.repo,
      postId,
    ]),
  );
}
const MARKER_CONTEXT = "feedbax/github-marker/v1";

async function hmacKey(raw: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Current key, then the raw-secret key issues already on GitHub were signed with. */
async function markerKeys(): Promise<[CryptoKey, CryptoKey]> {
  // Derived under its own context, same as admin links and unsubscribe, so those
  // signatures cannot be replayed as an issue marker. Verify still accepts the raw
  // secret: markers written before the derivation must keep closing an issue into Done.
  const encoder = new TextEncoder();
  const legacy = await hmacKey(encoder.encode(env.BETTER_AUTH_SECRET));
  const derived = await crypto.subtle.sign("HMAC", legacy, encoder.encode(MARKER_CONTEXT));
  return [await hmacKey(derived), legacy];
}
export async function issueMarker(postId: string): Promise<string> {
  const [current] = await markerKeys();
  const signature = await crypto.subtle.sign("HMAC", current, payload(postId));
  return `<!-- feedbax:v1:${postId}:${encode64(new Uint8Array(signature))} -->`;
}
export async function authenticMarker(body: string | null, postId: string): Promise<boolean> {
  // A trailing newline is still this marker. GitHub keeps one when the body is edited.
  const tail = body
    ?.replace(/(?:\r?\n)+$/, "")
    .split("\n")
    .at(-1);
  const prefix = `<!-- feedbax:v1:${postId}:`;
  if (!tail?.startsWith(prefix) || !tail.endsWith(" -->")) return false;
  try {
    const signature = decode64(tail.slice(prefix.length, -4));
    if (signature.length !== 32) return false;
    const [current, legacy] = await markerKeys();
    const data = payload(postId);
    return (
      (await crypto.subtle.verify("HMAC", current, signature, data)) ||
      (await crypto.subtle.verify("HMAC", legacy, signature, data))
    );
  } catch {
    return false;
  }
}
