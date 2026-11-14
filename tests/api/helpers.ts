import { env } from "cloudflare:workers";
import { createAuth } from "../../src/server/auth.ts";
import type { ViewerUser } from "../../src/contracts/domain.ts";
export function form(id: string = crypto.randomUUID()) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    title: "Useful feature",
    body: "A public description",
    category: "feature",
  }))
    data.set(key, value);
  return data;
}
export async function mintToken(overrides: Record<string, unknown> = {}) {
  const encode = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");
  const payload = {
    sub: "host-user",
    name: "Host user",
    exp: Math.floor(Date.now() / 1000) + 300,
    jti: crypto.randomUUID(),
    ...overrides,
  };
  const input = `${encode('{"alg":"HS256","typ":"JWT"}')}.${encode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(env.FEEDBAX_HOST_SECRET, "base64url"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${input}.${encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input))))}`;
}
export async function writer(): Promise<ViewerUser> {
  const user = await (
    await createAuth().$context
  ).internalAdapter.createUser(
    { name: "Ada", email: `${crypto.randomUUID()}@example.com`, emailVerified: false },
    { method: "test" },
  );
  return { id: user.id, name: user.name, kind: "account" };
}
export function png() {
  return new File(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    "image.png",
    { type: "image/png" },
  );
}
