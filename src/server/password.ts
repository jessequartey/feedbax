import { timingSafeEqual } from "node:crypto";
import { decode64, encode64 } from "./encoding.ts";

export const PASSWORD_ITERATIONS = 100_000;
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256),
  );
}
export async function hashPassword(
  password: string,
  iterations = PASSWORD_ITERATIONS,
): Promise<string> {
  if (!Number.isSafeInteger(iterations) || iterations < 50_000 || iterations > 100_000)
    throw new Error("Unsupported PBKDF2 iterations");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${encode64(salt)}$${encode64(await derive(password, salt, iterations))}`;
}
export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  try {
    const parts = hash.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256" || !/^\d+$/.test(parts[1])) return false;
    const iterations = Number(parts[1]);
    if (!Number.isSafeInteger(iterations) || iterations < 50_000 || iterations > 100_000)
      return false;
    const salt = decode64(parts[2]);
    const expected = decode64(parts[3]);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await derive(password, salt, iterations);
    const subtle = crypto.subtle as SubtleCrypto & {
      timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
    };
    return subtle.timingSafeEqual
      ? subtle.timingSafeEqual(actual, expected)
      : timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
