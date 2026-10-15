# Version 0.2.1 implementation review

Reviewed the changes since `v0.2.0` (`7b929d66fb7cb713c673754922432edda5433845`) using separate Standards and Spec reviewers on 2026-10-15.

## Standards

No definite documented-standard violations were found. Two heuristic findings were addressed: repeated migrated-D1 setup in the adapter suite was extracted into a test fixture, and the Vote store's misleading `postId` / `post_id` names were changed to `postSlug` / `post_slug`, matching the immutable slug actually stored.

## Spec

Three behavior findings were corrected and covered by regression tests:

- Connected voting now preserves actionable verification errors and rate-limit status codes, allowing an expired Participation Pass to recover through Turnstile.
- Command search retains previous results while the new term loads.
- Connected Top pagination uses the specified 25 Posts and validates the cursor's filter context.

Additional checks keep identity session reads outside the sign-in mutation rate-limit bucket and mark Connected Comment responses private/no-store.

Initial review findings: Standards — 0 hard violations and 2 resolved heuristic findings; Spec — 3 resolved behavior findings, with no outstanding review finding. The highest original Spec severity was P1 (verification recovery).

## UI and setup follow-up review

### Standards

The follow-up review found two related gaps in the shared TanStack Query path: component-local Comment loading and a canonical page observing only its loader snapshot. Both are fixed. Post loaders and page/dialog consumers now share typed query definitions; Comments use an independent infinite query with mutation cache updates and invalidation. The final Standards recheck found no remaining definite violation or actionable heuristic finding. Source/template synchronization and generated setup documents were checked.

### Spec

The follow-up review found four behavior issues: incomplete five-card batches at a roadmap page boundary, duplicate/stale Comment reconciliation during asynchronous reads, failure to remove Notion-resolved Comments on refresh, and private edit capabilities entering a public cache update. All were fixed and covered by regression checks. The final Spec recheck found no remaining actionable finding; roadmap batching, footer, heading removal, typography, changelog, and setup documentation match the requested behavior.

Follow-up outcome: Standards — all findings resolved; Spec — all findings resolved. Highest original severity within each axis was P2. Production Connected acceptance remains the separate release requirement in `version-0.2.1-acceptance.md`.

## Expanded Connected scope review

Reviewed the changes after 3209977 against ADR-0030, the expanded owner requirements, and the repository standards. The Standards and Spec passes ran independently.

### Standards

Initial findings identified retry claims that could bypass backoff or use stale attempts, uploader access that bypassed content removal, and a Notion review writer outside the shared rate-limit retry boundary. These were repaired with eligibility checks and owner-token fencing, authoritative attachment target checks, and the existing Notion create-request helper. Further hardening added atomic upload reservations, deletion tombstones, batched attribution/image reads, and durable rollback cleanup.

Final follow-up: no definite violations or substantial optional heuristics remain. The reviewer checked 43 source/template pairs and generated setup documents, including migrations, scheduled work, private R2, email secrets, Workers Paid limits, and separate production acceptance.

### Spec

Initial findings identified the image claim/deletion race, cleanup after successful creation rollback, partial notification event/checkpoint writes, and inability to unfollow an unavailable Post. Atomic deletion states, rollback tombstones, transactional event/fanout/checkpoint batches, independent status observation, and unconditional own-state unfollow resolved these findings. A real D1 trigger failure regression proves that a failed checkpoint cannot leave a half-created Notification.

Final follow-up: no new actionable findings remain. Following, in-app/email notifications, all three sender choices, image attachments, private routes/downloads, generated deployment wiring, draft controls, unsubscribe confirmation, and Feedback previews match the approved scope. Production acceptance remains pending and is documented separately.

## Docs identity and small processing follow-up

Independent Standards and Spec passes reviewed the follow-up from de41e3d through cb62e3c. Both found no authentication, privacy, replay, concurrency, or sender regressions. Standards identified one inconsistent creator prompt that still described Workers Paid as universally required; it now describes small processing on Workers Free with Resend/custom email. Spec found no actionable behavior finding. ADR-0031 records the owner's selected throughput tradeoff.

The live docs deployment exposed a Workers fetch incompatibility with `redirect: "error"`, despite Node-based request mocks passing. The shared sender now uses manual redirects and rejects non-success responses. The docs sign-in flow reuses that sender, and a native Miniflare Worker regression verifies successful delivery requests and rejected redirects without credential forwarding. The source suite passes 336 tests; the clean packed application passes 274 tests. Real browser authentication, scheduled notifications, and image moderation remain separate pending production checks.

The live browser flow also exposed a conflict between no-referrer and the portal's strict Origin check: cross-origin form POSTs used Origin null. The adapter and docs wrapper now preserve strict-origin on handoff HTML while other sign-in responses retain no-referrer. Both browser sessions completed the fixed handoff. Scheduled background reads now use the base Notion content module to avoid portal-only Vote, image, and author enrichment; the resulting Free CPU measurement remains a release gate.

### Final handoff and scheduler recheck

Standards: no definite violations or substantial heuristics. Spec: no actionable regressions. Both reviewers verified the unchanged publication/open-Comment rules, explicit D1 actor attribution, strict callback Origin validation, synchronized templates/guides, and retained small-mode bounds. Live optimized CPU remained 20 ms, so Workers Free capacity acceptance remains open.

## Workers Free queue and notification precision review

Independent Standards and Spec reviewers checked the small-mode queue dispatch, creator/doctor configuration, bounded history preparation, cancellation fencing, synchronized templates, and guides. Standards found no definite violations or substantial heuristics. Spec identified one migration gap that could notify existing Followers about historical Comments in the original Follow minute. Migration now prepares those Follows before activating updates. A migrated-D1 regression proves historical Comments produce no notice and a later same-minute Comment produces one. The final Spec recheck closed the finding; neither axis has an outstanding implementation finding.

The source suite passes 343 tests across 59 files. The live installation doctor passes D1/Queue/schema reads, type checks, tests, and production build. Native timer and queue delivery measurements are recorded separately in the acceptance document; publication still requires completion of live acceptance.
