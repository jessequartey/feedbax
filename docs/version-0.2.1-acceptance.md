# Version 0.2.1 acceptance

Status: implementation prepared for review; not released.

## Local engineering evidence — 2026-10-15

- Formatting, ESLint (including successful shadcn plugin registration), and TypeScript checks pass.
- 304 source tests pass. Connected behavior runs against migrated D1 through Miniflare rather than a fake SQL adapter.
- Coverage includes signed handoff expiry, signature/audience/browser validation, transactional replay rejection, session expiry/logout, same-origin mutation checks, duplicate concurrent Votes, cross-browser state, authoritative ranking and 25-Post pagination, private identity projection, spoofed Comment-name rejection, durable verified attribution, historical unverified Comments, and resolved-Comment hiding.
- Regression checks preserve expired Participation Pass recovery, HTTP 429 errors, private/no-store Comment responses, session reads outside the sign-in mutation limit, and previous search results while loading.
- The packed creator and lifecycle CLI generated an independent flat application. Its type checking, linting, behavior tests, production build, and Wrangler dry run passed. Version output remains 0.2.0 until the Changesets version PR advances the fixed group to 0.2.1.
- Portal and documentation production builds and Wrangler dry runs pass. Portal JavaScript is 288.5 KiB gzip across 28 chunks, within the 400 KiB total / 250 KiB per-chunk budgets.
- Tracked-file secret scanning and generated-template synchronization pass.
- Browser checks against the local portal with the actual Notion-backed feed verified clean background surfaces, desktop and 390px mobile Command layout, live search, Enter-to-open contextual Post details, and Escape-to-close. Screenshots are in `docs/ui-0.2.1/`.
- Separate Standards and Spec reviews are recorded in `docs/version-0.2.1-review.md`; all findings were addressed.

## Required before releasing 0.2.1

Run the Connected Profile on a dedicated production Worker and D1 database with a real authenticated Product Team application. Complete the signed login/callback, a second browser, duplicate Vote add/remove, logout, and native Notion Comment attribution checks. The local D1/HTTP tests and unsigned public-portal browser inspection do not constitute this production evidence. Keep the Notion 0.2.1 Changelog Entry unpublished until release succeeds, then set its actual release date and publish it.

The existing dogfood Installation remains Notion-only until an application login endpoint and dedicated D1 binding are deliberately configured. External design-partner adoption and custom domains remain owner-led parallel work.
