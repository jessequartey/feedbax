# GitHub provider implementation

Status: module foundation implemented for ticket 02; portal configuration/setup and App integration are not available yet. This is developer documentation, not an Installation guide or production acceptance record.

## Implemented seam

`createGitHubFeedbackModule` exposes the same Feedback module interface as the Notion adapter. It composes GitHub Post and Comment storage with private D1 records; routes do not translate provider payloads. Comment storage types now live in `comment-storage.ts`, with compatibility type exports from the Notion adapter.

The constructor requires a D1 binding, a server-verified Feedbax Installation ID, the permitted repository's numeric ID/owner/name, the App bot's verified numeric user ID, and an asynchronous `getToken` function supplying short-lived, repository-scoped installation access. These values are trusted server inputs, never authorization derived from a Participant request. The App service will supply this access in ticket 03; there is no new PAT setup path, App-key distribution, Team Member tool or public privileged endpoint here.

The adapter checks the current repository ID before external operations, fixes requests to GitHub.com, refuses redirects, and never follows a caller-provided URL or a Link-header destination. `request` and `sleep` can be injected at the external HTTP/clock seams for testing. The adapter does not require Notion credentials or Participant GitHub accounts.

## Private records and creation recovery

Migration `0005_github.sql` adds Installation-scoped Post/Comment mappings and indexes without changing the released Connected tables. Post slugs and trusted-submission external IDs have durable uniqueness constraints. Contact information, draft-capability hashes, image association IDs, external idempotency keys and private operation state remain in D1. Only explicit approved content is serialized into GitHub issues.

| Post operation state | Meaning                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| reserved             | Identity/slug/private input persisted; creation has not been attempted, or GitHub definitively rate-limited it |
| creating             | One caller atomically claimed the creation; another caller cannot blindly create the same issue                |
| ready                | Stable issue ID/number mapped privately to the Post                                                            |
| uncertain            | A timeout, upstream ambiguity or mapping failure requires an authoritative read before another write           |
| failed               | A definite non-retryable rejection is retained for diagnosis                                                   |
| withdrawn            | A permanent local tombstone prevents public access and slug reuse, including if provider cleanup fails         |

Trusted retries resume the same reserved operation. Ambiguous creations reconcile App-authored issues with the reserved immutable slug; zero or multiple candidates leave the operation pending without another create. A real D1 trigger test proves recovery after GitHub succeeds but the mapping commit fails. Concurrent same-key callers may receive a pending result and retry; no cross-system transaction or exactly-once claim is made.

Reads and definite rate-limit rejections have a three-attempt budget. Short Retry-After delays are honored; delays over two seconds return a typed retry requirement instead of blocking a Worker. Ambiguous POST outcomes are never automatically repeated. Durable scheduled queues, retry metrics, leases and operational recovery interfaces remain work for tickets 03/09. Browser submission intent deduplication across a lost outer HTTP response still requires the portal integration; the existing `submitPost` interface represents each call as a new intent.

## Publication and public projection

An issue's single `<!-- feedbax:public:v1 -->` / `<!-- /feedbax:public -->` section contains JSON with immutable slug, public title, description and Post Type, plus optional Team Response and safe release-notes URL. Marker-like Participant text is escaped in JSON without changing its displayed content. Missing, duplicate, invalid or slug-changing sections are unavailable rather than falling back to an issue body. Unknown fields, issue titles and engineering notes are not projected.

One dedicated status label supplies the six Post Status values. A separate `feedbax:published` label grants portal publication; issue closure does not imply Shipped or Closed. Conflicting/missing labels retain the last observed valid status, while removing publication hides content immediately on the next module read. Optional Projects and diagnostics are not implemented in this slice.

Draft edits require the existing Browser Capability and a current New/unpublished projection. They replace only the explicit public section, preserving outside engineering notes and the Team Response. Withdrawal retains a private tombstone and closes the source issue without deleting history. Public update timestamps advance only when the approved projection changes, so later private engineering activity does not change the displayed time.

A provider may deny draft editing through the storage contract's private `draftEditable` eligibility field. A retained New display status during a label conflict is not draft authority: draft reads, edits, withdrawal and draft attachment review fail closed until the workflow is unambiguous. Notion's existing status/capability checks remain unchanged.

Public lists filter/search/rank approved mapped issues before 25-Post pagination; roadmap totals use the same eligible snapshot. Support counts for best-effort participation are private D1 counters, never GitHub reactions or verified identity. Existing Connected composition supplies unique Votes and durable verified Comment attribution. Reads scan at most ten 100-item provider pages and fail explicitly on overflow; this bounded foundation is not a production capacity claim. Indexed/background read optimization remains part of the provider/recovery work.

## Portal Comments and attachments

Portal Comments have a separate versioned JSON section, a verified App author, a private stable mapping and preserved thread/Participant attribution. A copied marker, an unmapped App-authored comment or ordinary engineering discussion cannot enter the portal. Retries of uncertain mapping completion reconcile the existing remote Comment rather than creating another. Known Comment edits/deletes use their scoped mapping; local deletion tombstones suppress visibility even if remote cleanup fails. No engineering-reply publication tool is introduced.

The existing Image Attachment module composes with the GitHub Feedback module. A real migrated D1/private R2 test verifies unpublished images remain private, publication enables the ordinary authorized download, and unpublication revokes it. GitHub issues contain no private R2 review links or upload identifiers.

## Remaining ticket 02 work

- Provider-discriminated configuration, GitHub-only startup validation, and generated setup/diagnostics, with no hidden Notion requirement
- Portal runtime selection, existing cache invalidation/revocation behavior and processing integration
- Browser intent retry handling and complete durable edit/withdraw/Comment recovery; bounded production resource/scan behavior
- Clean packed GitHub Installation and real account/public/private acceptance through the paired App service

Ticket 02 remains claimed until its full criteria pass. This module foundation is not an installed GitHub portal, an official App deployment, or a 0.2.2 release.

API contracts checked against [GitHub issue endpoints](https://docs.github.com/en/rest/issues/issues), [issue Comment endpoints](https://docs.github.com/en/rest/issues/comments), and [REST retry guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) on 2026-10-15. Tests use the GitHub HTTP seam and migrated D1/R2 rather than mocked SQL or internal collaborators.
