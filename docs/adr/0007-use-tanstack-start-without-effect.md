---
status: accepted
---

# Use TanStack Start without Effect in version 0.2.0

The standalone portal uses TypeScript, TanStack Start, Cloudflare's Vite plugin, and Cloudflare Workers, with pinned framework versions and thin framework-specific routes because Start is currently release-candidate software. Version 0.2.0 uses native async TypeScript, explicit result types, and focused retry utilities instead of adding Effect's second execution and error model; Effect may be reconsidered when Connected Profile workflows make that complexity pay for itself, while Next.js waits for demonstrated demand or an outside maintainer.
