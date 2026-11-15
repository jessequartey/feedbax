// Signed one-click unsubscribe links. No new secret: the key is derived from the existing
// BETTER_AUTH_SECRET, the same way admin links are (src/server/admin-link.ts), under its own
// context string so the two signatures can never be swapped. Pure Web Crypto, no bindings.
//
// Link: <PORTAL_URL>/api/email/unsubscribe?u=<userId>&k=<kind>&t=<sig>
//   sig = base64url(HMAC-SHA256(K, "<userId>\n<kind>")), K = HMAC-SHA256(secret, CONTEXT)
// The link does not expire: an unsubscribe link must keep working in old mail (RFC 8058).
// It only ever turns one email kind off for one user, so a leaked link can do no more.

export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";
/** The portal page a person lands on from the link in the email footer. */
export const UNSUBSCRIBE_PAGE = "/unsubscribe";
const CONTEXT = "feedbax/email-unsubscribe/v1";

/** Email kinds a person can turn off, as they appear in links. */
export const EMAIL_KINDS = ["status", "replies", "changelog", "digest"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
export type UnsubscribeClaims = { userId: string; kind: EmailKind; postId?: string };

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

const keys = new Map<string, Promise<CryptoKey>>();
function signingKey(secret: string): Promise<CryptoKey> {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Invalid BETTER_AUTH_SECRET");
  let key = keys.get(secret);
  if (!key) {
    key = (async () => {
      const encoder = new TextEncoder();
      const root = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(CONTEXT));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify",
      ]);
    })();
    keys.clear();
    keys.set(secret, key);
  }
  return key;
}

function payload(userId: string, kind: EmailKind, postId?: string): string {
  return postId ? `${userId}\n${kind}\n${postId}` : `${userId}\n${kind}`;
}

async function sign(
  secret: string,
  userId: string,
  kind: EmailKind,
  postId?: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    new TextEncoder().encode(payload(userId, kind, postId)),
  );
  return base64url(new Uint8Array(signature));
}

/** The query string (`u`, `k`, optional `p`, `t`) shared by one-click and footer links. */
export async function unsubscribeQuery(
  secret: string,
  userId: string,
  kind: EmailKind,
  postId?: string,
): Promise<URLSearchParams> {
  if (!USER_ID.test(userId)) throw new Error("Invalid user id");
  if (postId !== undefined && !POST_ID.test(postId)) throw new Error("Invalid post id");
  const t = await sign(secret, userId, kind, postId);
  return new URLSearchParams(
    postId ? { u: userId, k: kind, p: postId, t } : { u: userId, k: kind, t },
  );
}

/** Null for anything malformed or not signed by this portal. */
export async function verifyUnsubscribe(
  input: { u?: unknown; k?: unknown; p?: unknown; t?: unknown },
  secret: string,
): Promise<UnsubscribeClaims | null> {
  const { u, k, p, t } = input;
  if (typeof u !== "string" || !USER_ID.test(u)) return null;
  if (typeof k !== "string" || !(EMAIL_KINDS as readonly string[]).includes(k)) return null;
  if (p !== undefined && (typeof p !== "string" || !POST_ID.test(p))) return null;
  if (typeof t !== "string" || !SIGNATURE.test(t)) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(t.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
      c.charCodeAt(0),
    );
  } catch {
    return null;
  }
  // One signature, one spelling.
  if (bytes.length !== 32 || base64url(bytes) !== t) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    bytes,
    new TextEncoder().encode(payload(u, k as EmailKind, p)),
  );
  return valid
    ? { userId: u, kind: k as EmailKind, ...(p !== undefined ? { postId: p } : {}) }
    : null;
}
