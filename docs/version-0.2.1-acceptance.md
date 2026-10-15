# Version 0.2.1 acceptance

Status: implementation prepared for review; not released.

## Local engineering evidence — 2026-10-15

- Formatting, ESLint (including enforced shadcn theme-color, known-class, and static-class checks), and TypeScript checks pass.
- 316 source tests pass. Connected behavior runs against migrated D1 through Miniflare rather than a fake SQL adapter.
- Coverage includes signed handoff expiry, signature/audience/browser validation, transactional replay rejection, session expiry/logout, same-origin mutation checks, duplicate concurrent Votes, cross-browser state, authoritative ranking and 25-Post pagination, private identity projection, spoofed Comment-name rejection, durable verified attribution, historical unverified Comments, and resolved-Comment hiding.
- Regression checks preserve expired Participation Pass recovery, HTTP 429 errors, private/no-store Comment responses, session reads outside the sign-in mutation limit, and previous search results while loading.
- The packed creator and lifecycle CLI generated an independent flat application. Its 258 behavior tests, type checking, linting, production build, and Wrangler dry run passed. Version output remains 0.2.0 until the Changesets version PR advances the fixed group to 0.2.1.
- Portal and documentation production builds and Wrangler dry runs pass. Portal JavaScript is 289.3 KiB gzip across 27 chunks, within the 400 KiB total / 250 KiB per-chunk budgets.
- Tracked-file secret scanning and generated-template synchronization pass.
- Browser checks against the local portal with the actual Notion-backed feed verified clean background surfaces, desktop and 390px mobile Command layout, live search, Enter-to-open contextual Post details, and Escape-to-close. Screenshots are in `docs/ui-0.2.1/`.
- Default Top excludes Shipped Posts before pagination. Explicit Shipped filters, search, New, and the roadmap retain discovery. Regression coverage checks full pages with higher-voted Shipped Posts; the browser confirms the active feed and explicit Shipped filter against Notion.
- Complete authentication and feedback block guides render in the documentation site. Executable server examples prove signed handoff compatibility and submission through the copied client into the actual trusted handler, including retries, unpublished moderation, and unsigned/cross-origin/rate-limit rejection.
- Separate Standards and Spec reviews are recorded in `docs/version-0.2.1-review.md`; all findings were addressed.

## Required before releasing 0.2.1

Run the Connected Profile on a dedicated production Worker and D1 database with a real authenticated Product Team application. Complete the signed login/callback, a second browser, duplicate Vote add/remove, logout, and native Notion Comment attribution checks. The local D1/HTTP tests and unsigned public-portal browser inspection do not constitute this production evidence. Keep the Notion 0.2.1 Changelog Entry unpublished until release succeeds, then set its actual release date and publish it.

The existing dogfood Installation remains Notion-only until an application login endpoint and dedicated D1 binding are deliberately configured. External design-partner adoption and custom domains remain owner-led parallel work.

## Portal and setup follow-up evidence

- Dialog shell opens immediately while its content chunk loads. Both dialog and canonical page show Post content before independent Comment reads, with context-sized skeletons and retry feedback.
- A shared typed Post query is seeded by the route loader and observed by page/dialog components. Comments use an infinite query; mutation cancellation, public cache updates, invalidation, and ID upserts prevent duplicate, stale edited, and resurrected deleted Comments. Authoritative refresh removes Notion-resolved Comments and tests inspect every cache snapshot for leaked edit capabilities.
- Composer and compact shadcn Item profile/sign-in prompts precede the independently scrollable thread list. Reply focuses the composer. The redundant full-page toolbar and home-page Posts heading are removed.
- Roadmap previews start at five uniform cards, with two-line title/description clamps. View more fills the next five-card window across server-page boundaries or exhausts the results. Browser evidence verifies five initial Shipped cards and ten after expansion.
- Page headings use 24px, Post dialog titles 18px, and descriptions 14px on the shared shadcn scale. Desktop and 390px mobile views were checked; Changelog uses a restrained timeline with readable paragraphs.
- The bottom-right footer links Powered by Feedbax to GitHub. The repository README, agent setup guide, and owned-app README/AGENTS describe actual setup flags, credentials, configuration, diagnostics, and completion checks.
- All three active shadcn rules reject a negative fixture; a valid themed Button passes. The generated app uses a real CSS import so the same lint checks resolve its theme.
