import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { HOST_TOKEN_HEADER } from "../contracts/host-token.ts";
import type { HostTokenClaims } from "../contracts/host-token.ts";
import { createDb } from "../db/client.ts";
import { usedTokens, user } from "../db/schema.ts";
import { decode64 } from "./encoding.ts";
import { DomainError, reportHostConfiguration } from "./errors.ts";
import { record, text, uuid } from "./validation.ts";
import type { AuthContext } from "better-auth";

export async function verifyHostToken(
  token: string,
  secret = env.FEEDBAX_HOST_SECRET,
  now = Math.floor(Date.now() / 1000),
): Promise<HostTokenClaims> {
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = decode64(secret);
    if (keyBytes.length < 32) throw new Error();
  } catch {
    reportHostConfiguration();
    throw new DomainError("unavailable", "Invalid FEEDBAX_HOST_SECRET configuration.");
  }
  try {
    if (typeof token !== "string" || token.length > 4096) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const [header, payload, signature] = parts.map(decode64);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    if (decoder.decode(header) !== HOST_TOKEN_HEADER || signature.length !== 32) throw new Error();
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
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
    // Old public accounts may have squatted the historical deterministic email.
    // Preserve their data and create a distinct internal identity; never link by email.
    const email = `host-${suffix}@users.feedbax.invalid`;
    const collision = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .get();
    try {
      await adapter.createUser(
        {
          name: claims.name,
          email: collision ? `host-${suffix}-${crypto.randomUUID()}@users.feedbax.invalid` : email,
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
  const resolved =
    existing ?? (await db.select().from(user).where(eq(user.hostSubject, claims.sub)).get())!;
  if (resolved.name === claims.name) return resolved;
  return adapter.updateUser(resolved.id, { name: claims.name });
}
