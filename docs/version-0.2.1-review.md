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
