# Version 0.2.1 acceptance

Status: production acceptance passed on Workers Free; 0.2.1 released on 2026-10-15.

## Release completion — 2026-10-15

The earlier pending/draft statements below describe the pre-release sequence. PR #12 merged as `371d18e`, tag `v0.2.1` points to that commit, and the [GitHub release](https://github.com/jessequartey/feedbax/releases/tag/v0.2.1) was published at 07:09:33 UTC. Read-only npm checks resolve both `feedbax@0.2.1` and `create-feedbax@0.2.1`. The 0.2.2 production-acceptance and published-release start gate is satisfied. This does not assert that the separate Notion Changelog Entry has been published.

## Local engineering evidence — 2026-10-15

- Formatting, ESLint (including enforced shadcn theme-color, known-class, and static-class checks), and TypeScript checks pass.
- 343 source tests pass. Connected behavior runs against migrated D1 through Miniflare rather than a fake SQL adapter.
- Coverage includes signed handoff expiry, signature/audience/browser validation, transactional replay rejection, session expiry/logout, same-origin mutation checks, duplicate concurrent Votes, cross-browser state, authoritative ranking and 25-Post pagination, private identity projection, spoofed Comment-name rejection, durable verified attribution, historical unverified Comments, and resolved-Comment hiding.
- Regression checks preserve expired Participation Pass recovery, HTTP 429 errors, private/no-store Comment responses, session reads outside the sign-in mutation limit, and previous search results while loading.
- The packed creator and lifecycle CLI generated an independent flat application. Its 278 behavior tests, type checking, linting, production build, and Wrangler dry run passed. Version output remains 0.2.0 until the Changesets version PR advances the fixed group to 0.2.1.
- Portal and documentation production builds and Wrangler dry runs pass. Portal JavaScript is 296.8 KiB gzip across 35 chunks, within the 400 KiB total / 250 KiB per-chunk budgets.
- Tracked-file secret scanning and generated-template synchronization pass.
- Browser checks against the local portal with the actual Notion-backed feed verified clean background surfaces, desktop and 390px mobile Command layout, live search, Enter-to-open contextual Post details, and Escape-to-close. Screenshots are in `docs/ui-0.2.1/`.
- Default Top excludes Shipped Posts before pagination. Explicit Shipped filters, search, New, and the roadmap retain discovery. Regression coverage checks full pages with higher-voted Shipped Posts; the browser confirms the active feed and explicit Shipped filter against Notion.
- Complete authentication and feedback block guides render in the documentation site. Executable server examples prove signed handoff compatibility and submission through the copied client into the actual trusted handler, including retries, unpublished moderation, and unsigned/cross-origin/rate-limit rejection.
- Separate Standards and Spec reviews are recorded in `docs/version-0.2.1-review.md`; all findings were addressed.

## Required before releasing 0.2.1

The owner explicitly chose production validation before npm publication on 2026-10-15. Version PR #12 is draft. The selected authenticated application is Feedbax Docs and the selected sender is Resend. See [docs identity setup](docs-identity-acceptance.md) for the dedicated resources and sign-in flow. Do not merge the version PR, publish the Notion Changelog Entry, or close the release until the live checks below pass.

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

## Following, notifications, and image evidence

- The final source suite passes 343 tests across 59 files. A clean packed installation passes 278 tests across 50 files plus types, lint, production build, and deployment dry run. Guided creator tests cover identity-only, Cloudflare email, Resend, custom delivery, and private image bucket configuration without putting secrets in public configuration.
- Migrated Miniflare D1/R2 checks prove idempotent cross-browser Follows, private inbox/read state, verified email eligibility, stable delivery keys, retries/unsubscribe, atomic event/fanout/checkpoint rollback, image ownership/publication, attachment limits, failed submission cleanup, and creator/public access removal after content deletion. Real Worker HTTP tests cover image authentication, origin checks, size limits, and private no-store downloads.
- Notification leases recheck current eligibility and fence completion with a unique owner token. Status changes commit independently from Comment pagination. Full Comment pages use parameterized JSON inserts rather than per-Comment fanout requests; attribution and attachment reads are batched.
- Browser inspection of the actual Notion-only portal confirms two-line Feedback descriptions with full text retained on detail pages. The development server required a fresh dependency cache after the component installation; the same page then rendered correctly.
- A separate local preview mounts the actual Connected UI components with controlled sample HTTP responses. Desktop and 390px mobile checks verify Follow state, inbox layout, Mark all read, and email preference changes. The associated screenshots are notifications-desktop.png and notifications-mobile.png. These are UI evidence, not real application sign-in or email delivery evidence. No real notification emails were sent during that local preview.
- Full Connected production acceptance now includes the real application identity/email assertion, two-browser Follows, direct Notion status/Comment changes, scheduled processing, sender receipt/retry/unsubscribe, private R2, draft image review, and public access removal. The Notion 0.2.1 Changelog Entry remains unpublished until this gate and release succeed.

## Dedicated production results — 2026-10-15

The initial dedicated checks and direct-cron capacity failure are recorded below. The completed Free redesign results follow. No 0.2.1 npm publication is claimed in this pre-release evidence.

- Real Resend email links reached the authorized Gmail mailbox. The browser removed the fragment token and required confirmation. Independent IAB and Chrome sessions completed the docs application login and signed portal handoff. D1 confirmed one Participant, two sessions, one Vote, one Follow, and one attributed Comment. The second browser retained the original display name despite supplying a different name at sign-in.
- Adding a Vote in IAB, removing it in Chrome, adding it again, and refreshing IAB preserved a single authoritative Vote. Both browsers displayed the same Follow state and verified Comment attribution.
- A native Notion Product Team reply displayed as Product Team. Resolving that thread in Notion removed it from a fresh portal read and immediately changed its image download to 404.
- Direct Notion status and Comment changes produced two private in-app Notifications through the actual five-minute cron. Mark all read persisted across browsers. Resend delivered the Comment notification to Gmail; the status email was processed on the subsequent run. Gmail placed some validation messages in Spam, so mailbox placement is not guaranteed.
- A real pending image returned 404 anonymously. After creating an unpublished draft, its private Notion review link returned 200 with no-store. Publishing the Post made the ordinary image route return 200; unpublishing returned it to 404. The dedicated image Post was moved to recoverable Notion Trash for removal validation. R2 public development access and custom domains are disabled.
- Nine negative live HTTP checks rejected expired handoffs, cross-origin mutations, unsigned social/image access, unsafe callbacks, oversized confirmation bodies, and the raw authentication session endpoint.
- Live validation caught two defects that local request mocks missed: Workers rejects fetch redirect mode error, and no-referrer hides the Origin of a browser form POST. Native Worker sender tests now cover manual redirect handling; HTTP tests cover strict-origin on both the documented adapter and the actual docs handoff response. The fixed handoff succeeded in both real browsers.
- Initial direct-cron Workers Free capacity was not accepted. The first two scheduled invocations succeeded but consumed 27 ms and 17 ms CPU, above its documented 10 ms allowance. Scheduled reads now avoid unnecessary portal Vote/image/author enrichment. The optimized runs consumed 20 ms and 21 ms and still exceed that allowance. A controlled provider rejection left one pending delivery with one attempt; restoring the original Resend secret let the next scheduled run deliver it successfully. Gmail confirmed that recovered third message. Successful invocations above the allowance do not prove sustainable Free operation.

Browser evidence: `connected-production-comment.png` and `connected-production-notifications.png` under `docs/ui-0.2.1/`. Private test state and sanitized timing records remain outside Git; release evidence contains no email tokens, cookies, provider keys, or Participant subjects.

### Completion and cleanup of functional checks

The live delivery sequence produced exactly three sent Notification records: two first-attempt deliveries and one successful recovery after a rejected attempt, with none pending. Opening the unsubscribe URL preserved opt-in; confirming it turned email off. Both docs sessions and both portal sessions were signed out. A revoked portal session could no longer read the private inbox, while the other independent session remained usable before its own sign-out. Reusing a consumed email link was rejected.

The dedicated Post became Shipped through Notion; default Top hid it and an explicit Shipped filter still exposed it. Test Follow and Vote were removed, both test Posts moved to recoverable Notion Trash, and both disposable R2 images and D1 associations were removed. Credentials, private infrastructure, and sanitized acceptance state are retained outside Git for the next validation; no unrelated content or infrastructure was changed. Raw Worker traces were deleted after extracting safe timing/outcome fields.

The owner chose to keep Workers Free and redesign before publishing. Small mode now dispatches a constant signal into a dedicated Cloudflare Queue; standard mode retains direct scheduling for Workers Paid. The following section records the redesign validation. Version PR #12 remains draft until the gate passes; no billing changes or npm publication have occurred.

## Completed Workers Free redesign validation — 2026-10-15

The owner selected retaining Free and redesigning before publication. Small processing now uses a dedicated queue with one-message batches, one consumer, bounded retries, and constant signals containing no Participant data. Several actual scheduled timer invocations measured 0–1 ms CPU against Free's 10 ms allowance. Native queue consumers completed successfully in 9–25 ms under their separate consumer limit. The final scheduled timer measured 0 ms and its email-delivery consumer 9 ms. No over-limit timer success is relied on for acceptance.

A live Follow request initially used 13–19 ms while reading its first 50 Comments. Small mode now defers every history page to the queue and uses the base published Notion projection. The revised real creation request used 5 ms and removal 2 ms. The UI shows cancellable preparation; longer histories complete across bounded runs. Standard mode retains immediate first-page preparation.

The production browser verified cancellation and re-enrollment with 51 historical native Comments. Preparation completed without new notifications. A subsequent native Product Team Comment and status change each produced exactly one private in-app notice and one actual Gmail email. Five Notification records are now sent in total: the three earlier validation deliveries plus these two; none remain pending. Explicit administrative test signals exercised the same native consumer between real scheduled ticks; the final scheduled tick delivered the remaining email. Receipt, deduplication, and history suppression were confirmed separately from CPU measurements.

Review caught a migration edge case for existing Follows. Migration now routes them through preparation before the new timestamp eligibility rule activates. Migrated real-D1 tests cover historical same-minute Comments, later same-minute Comments, repeat status transitions, bounded pagination, cancellation, and idempotent cross-browser enrollment. Both independent reviewers closed all findings.

Final engineering validation: 343 source tests across 59 files and 278 clean packed-installation tests across 50 files pass, with lint, formatting, types, builds, deployment dry runs, secret scanning, and template synchronization. The live installation doctor passes its Queue/D1/Notion checks, type check, tests, and build. Screenshots: connected-production-preparation.png and connected-production-free-notifications.png. Publication remains subject to the final PR and release CI checks. Adoption and custom domains remain owner-led.

After revalidation, email was disabled, unread state cleared, the test Follow removed with cascading baseline cleanup, and the portal test session signed out. The dedicated Post and its synthetic Comment history were moved together to recoverable Notion Trash. No new images were created during this phase.
