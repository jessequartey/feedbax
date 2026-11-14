// `/login?to=` must only ever carry a same-origin relative path.

const FALLBACK = "/";

export function safeRelativePath(input: unknown, fallback = FALLBACK): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 500) return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f || char === "\\") return fallback;
  }
  let url: URL;
  try {
    url = new URL(input, "http://portal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://portal.invalid") return fallback;
  // Returning to an auth page after signing in would loop.
  if (url.pathname === "/login" || url.pathname === "/signup") return fallback;
  return url.pathname + url.search + url.hash;
}

export function loginHref(to: string): string {
  const path = safeRelativePath(to);
  return path === FALLBACK ? "/login" : `/login?to=${encodeURIComponent(path)}`;
}
