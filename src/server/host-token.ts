import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { HOST_TOKEN_HEADER } from "../contracts/host-token.ts";
import type { HostTokenClaims } from "../contracts/host-token.ts";
import { createDb } from "../db/client.ts";
import { usedTokens, user } from "../db/schema.ts";
import { decode64 } from "./encoding.ts";
import { DomainError } from "./errors.ts";
import { record, text, uuid } from "./validation.ts";
import type { AuthContext } from "better-auth";

export async function verifyHostToken(
  token: string,
  secret = env.FEEDBAX_HOST_SECRET,
  now = Math.floor(Date.now() / 1000),
): Promise<HostTokenClaims> {
  try {
    if (typeof token !== "string" || token.length > 4096) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const [header, payload, signature] = parts.map(decode64);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    if (decoder.decode(header) !== HOST_TOKEN_HEADER || signature.length !== 32) throw new Error();
    const key = await crypto.subtle.importKey(
      "raw",
      decode64(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      ))
    )
      throw new Error();
    const claims = record(JSON.parse(decoder.decode(payload)));
    const sub = text(claims.sub, 200, "sub");
    if (/[\r\n\u2028\u2029]/u.test(sub)) throw new Error();
    const name = text(claims.name, 80, "name");
    const jti = uuid(claims.jti, "jti");
    const exp = claims.exp;
    if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp < now - 30 || exp > now + 330)
      throw new Error();
    return { sub, name, exp, jti };
  } catch {
    throw new DomainError("unauthenticated", "The host token is invalid or expired.");
  }
}
export async function consumeHostToken(claims: HostTokenClaims): Promise<void> {
  // Retain the replay marker through the entire accepted skew window; cron uses milliseconds.
  const inserted = await createDb(env.DB)
    .insert(usedTokens)
    .values({ jti: claims.jti, expiresAt: (claims.exp + 30) * 1000 })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length)
    throw new DomainError("unauthenticated", "This host token has already been used.");
}
export async function resolveHostUser(
  claims: HostTokenClaims,
  adapter: AuthContext["internalAdapter"],
) {
  const db = createDb(env.DB);
  let existing = await db.select().from(user).where(eq(user.hostSubject, claims.sub)).get();
  if (!existing) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(claims.sub)),
    );
    const suffix = [...digest]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
    try {
      await adapter.createUser(
        {
          name: claims.name,
          email: `host-${suffix}@users.feedbax.invalid`,
          emailVerified: false,
          hostSubject: claims.sub,
          isAnonymous: false,
        },
        { method: "host" },
      );
    } catch (error) {
      // Only a concurrent insert of this exact subject is recoverable.
      existing = await db.select().from(user).where(eq(user.hostSubject, claims.sub)).get();
      if (!existing) throw error;
    }
  }
  const updated = await adapter.updateUser(
    (existing ?? (await db.select().from(user).where(eq(user.hostSubject, claims.sub)).get()))!.id,
    { name: claims.name },
  );
  return updated;
}
