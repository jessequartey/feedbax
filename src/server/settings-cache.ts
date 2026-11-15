// A tiny per-isolate cache for the runtime settings. Every request needs the effective
// settings (header name, anonymous decision, categories), but they change rarely, so one
// D1 read is shared by all requests in an isolate for a short TTL. saveSettings clears the
// cache in the isolate that handled the write; other isolates catch up within the TTL.
// No Cloudflare imports: the test fixture clears it between tests.

export const SETTINGS_TTL_MS = 10_000;

let entry: { owner: object; base: object; expires: number; value: Promise<unknown> } | null = null;

export function cachedSettings<T>(
  owner: object,
  base: object,
  now: number,
  load: () => Promise<T>,
): Promise<T> {
  if (entry && entry.owner === owner && entry.base === base && entry.expires > now)
    return entry.value as Promise<T>;
  const value = load();
  const mine = { owner, base, expires: now + SETTINGS_TTL_MS, value };
  entry = mine;
  // Never keep a failed read: the next request must try again.
  value.catch(() => {
    if (entry === mine) entry = null;
  });
  return value;
}

export function clearSettingsCache(): void {
  entry = null;
}
