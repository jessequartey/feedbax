import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client.ts";
import { syncState } from "../db/schema.ts";
import { EmailError } from "./resend.ts";

/** Only fixed codes and HTTP statuses reach health state; never provider response text. */
export async function emailFailure(error: unknown): Promise<void> {
  const email = error instanceof EmailError ? error : null;
  const value = JSON.stringify({
    code: email?.code ?? "storage",
    status: email?.status ?? null,
    at: new Date().toISOString(),
  });
  await createDb(env.DB)
    .insert(syncState)
    .values({ key: "email.error", value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: Date.now() } });
}

export async function emailSuccess(): Promise<void> {
  await createDb(env.DB).delete(syncState).where(eq(syncState.key, "email.error"));
}

/** Hash user IDs as well as event IDs: fixed length, no addresses in keys or logs. */
export async function deliveryKey(event: string, recipient: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([event, recipient])),
  );
  return `feedbax/${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
