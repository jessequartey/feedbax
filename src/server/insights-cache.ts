// A per-isolate cache for the admin insights result, one entry per range. The popular-requests
// query walks every vote on every open post, so one load is shared by every admin request in an
// isolate for a few minutes. Nothing invalidates it: the page says when it was last updated.
// Admin data never goes in the Cache API. No Cloudflare imports: the test fixture clears it
// between tests.
import type { AdminInsights, InsightsRange } from "../contracts/admin.ts";

export const INSIGHTS_TTL_MS = 5 * 60_000;

type Entry = { owner: object; expires: number; value: Promise<AdminInsights> };
const entries = new Map<InsightsRange, Entry>();

export function cachedInsights(
  range: InsightsRange,
  owner: object,
  now: number,
  load: () => Promise<AdminInsights>,
): Promise<AdminInsights> {
  const hit = entries.get(range);
  if (hit && hit.owner === owner && hit.expires > now) return hit.value;
  const mine: Entry = { owner, expires: now + INSIGHTS_TTL_MS, value: load() };
  entries.set(range, mine);
  // Never keep a failed read: the next request must try again.
  mine.value.catch(() => {
    if (entries.get(range) === mine) entries.delete(range);
  });
  return mine.value;
}

export function clearInsightsCache(): void {
  entries.clear();
}
