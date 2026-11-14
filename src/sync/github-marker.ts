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
async function key() {
  // Use the server's auth secret, independent of host token rotation.
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function issueMarker(postId: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await key(), payload(postId));
  return `<!-- feedbax:v1:${postId}:${encode64(new Uint8Array(signature))} -->`;
}
export async function authenticMarker(body: string | null, postId: string): Promise<boolean> {
  const tail = body?.split("\n").at(-1);
  const prefix = `<!-- feedbax:v1:${postId}:`;
  if (!tail?.startsWith(prefix) || !tail.endsWith(" -->")) return false;
  try {
    const signature = decode64(tail.slice(prefix.length, -4));
    return (
      signature.length === 32 &&
      (await crypto.subtle.verify("HMAC", await key(), signature, payload(postId)))
    );
  } catch {
    return false;
  }
}
