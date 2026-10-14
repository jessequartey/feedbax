---
status: accepted
---

# Use Cloudflare Workers Caching for public reads

TanStack Start produces cacheable, user-invariant public responses and headers, while Cloudflare Workers Caching supplies the shared tiered cache, request collapsing, stale refresh, and stale-on-error behavior without KV or D1. Only allowlisted public projections are cacheable, Feedbax writes purge their cache tags or paths, and direct Notion edits accept a bounded two-minute freshness delay so the Notion-only Profile avoids querying Notion on every public request.
