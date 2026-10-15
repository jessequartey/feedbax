// Session storage is tab-scoped. A failed request reuses the same secret intent
// across a retry/reload; successful completion makes a later submission distinct.
export async function submissionIntent(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  input: unknown,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  );
  const digest = Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  const slot = `feedbax:pending-submission:${digest}`;
  let key = storage.getItem(slot);
  if (!key || !/^[A-Za-z0-9_-]{43}$/.test(key)) {
    key = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    storage.setItem(slot, key);
  }
  return { key, complete: () => storage.removeItem(slot) };
}
