// Per-isolate cache of rendered /changelog.rss XML, keyed by D1 binding and ETag.
// No Cloudflare imports: the worker test fixture clears it between tests.

const FEED_CACHE_MAX = 8;

let feedCache = new WeakMap<D1Database, Map<string, string>>();

export function clearFeedCache(): void {
  feedCache = new WeakMap();
}

export function getCachedXml(db: D1Database, etag: string): string | undefined {
  return feedCache.get(db)?.get(etag);
}

export function setCachedXml(db: D1Database, etag: string, xml: string): void {
  let entries = feedCache.get(db);
  if (!entries) {
    entries = new Map();
    feedCache.set(db, entries);
  }
  entries.set(etag, xml);
  while (entries.size > FEED_CACHE_MAX) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
}
