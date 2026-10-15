# GitHub provider implementation

Status: provider configuration, generated setup, portal runtime, paired App service and private My feedback are implemented and undergoing acceptance. Tickets 02/03/06 remain in progress; see [live acceptance](version-0.2.2-acceptance.md). Optional Projects and remaining lifecycle work are not claimed complete.

## Implemented seam

`createGitHubFeedbackModule` exposes the same Feedback module interface as the Notion adapter. It composes GitHub Post and Comment storage with private D1 records; routes do not translate provider payloads. Comment storage types now live in `comment-storage.ts`, with compatibility type exports from the Notion adapter.

The constructor requires a D1 binding, a server-verified Feedbax Installation ID, the permitted repository's numeric ID/owner/name, the App bot's verified numeric user ID, and an asynchronous `getToken` function supplying short-lived, repository-scoped installation access. These values are trusted server inputs, never authorization derived from a Participant request. The App service supplies this access after paired authorization; there is no new PAT setup path, App-key distribution, Team Member tool or public privileged endpoint here.

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

Reads and definite rate-limit rejections have a three-attempt budget. Short Retry-After delays are honored; delays over two seconds return a typed retry requirement instead of blocking a Worker. Ambiguous POST outcomes are never automatically repeated. The integration service uses durable delivery receipts, leases, bounded retries and fair polling checkpoints. Work and revocations are fenced to the selected binding generation, including a pairing rotation during webhook ingress. Portal reconciliation independently leases and checkpoints mapped Posts, continues an older scan before newer polling receipts, and expires diagnostics even when no eligible work remains.

Browser submissions use a tab-held random intent to recover the original Post and draft authority after a lost response; only its hash is stored privately. GitHub Comments derive a stable scoped identity from a secret submission intent, with an additional verified-subject namespace for Connected. Retrying recovers the mapped App-authored Comment, original timestamp and exact thread. Definitive rate limits preserve a private retry time and atomically resume the same operation; an ambiguous outcome still requires authoritative reconciliation. Raw intent keys never enter public records.

The composer retains text and images on failure. A migrated D1/R2 regression covers transient verified-attribution failure and retry after attachment association: the same Comment and same owner's images recover without deletion or duplication. Reusing an already attached image with a different intent fails before another Comment is created. Private recovery metadata is excluded from serialized responses. These are local behavior checks; live Comment mutation/recovery acceptance remains pending.

## Publication and public projection

An issue's single `<!-- feedbax:public:v1 -->` / `<!-- /feedbax:public -->` section contains JSON with immutable slug, public title, description and Post Type, plus optional Team Response and safe release-notes URL. Marker-like Participant text is escaped in JSON without changing its displayed content. Missing, duplicate, invalid or slug-changing sections are unavailable rather than falling back to an issue body. Unknown fields, issue titles and engineering notes are not projected.

One dedicated status label supplies the six Post Status values. A separate `feedbax:published` label grants portal publication; issue closure does not imply Shipped or Closed. Conflicting/missing labels retain the last observed valid status, while removing publication hides content immediately on the next module read. Optional Projects and diagnostics are not implemented in this slice.

Draft edits require a valid Browser Capability or server-verified Participant ownership and a current New/unpublished projection. They replace only the explicit public section, preserving outside engineering notes and the Team Response. Withdrawal retains a private tombstone and closes the source issue without deleting history. Public update timestamps advance only when the approved projection changes, so later private engineering activity does not change the displayed time.

A provider may deny draft editing through the storage contract's private `draftEditable` eligibility field. A retained New display status during a label conflict is not draft authority: draft reads, edits, withdrawal and draft attachment review fail closed until the workflow is unambiguous. Notion's existing status/capability checks remain unchanged.

Public lists filter/search/rank approved mapped issues before 25-Post pagination; roadmap totals use the same eligible snapshot. Support counts for best-effort participation are private D1 counters, never GitHub reactions or verified identity. Existing Connected composition supplies unique Votes and durable verified Comment attribution. Reads scan at most ten 100-item provider pages and fail explicitly on overflow; this bounded foundation is not a production capacity claim. Indexed/background read optimization remains part of the provider/recovery work.

## Portal Comments and attachments

Portal Comments have a separate versioned JSON section, a verified App author, a private stable mapping and preserved thread/Participant attribution. A copied marker, an unmapped App-authored comment or ordinary engineering discussion cannot enter the portal. Retries of uncertain mapping completion reconcile the existing remote Comment rather than creating another. Known Comment edits/deletes use their scoped mapping; local deletion tombstones suppress visibility even if remote cleanup fails. No engineering-reply publication tool is introduced.

The existing Image Attachment module composes with the GitHub Feedback module. A real migrated D1/private R2 test verifies unpublished images remain private, publication enables the ordinary authorized download, and unpublication revokes it. GitHub issues contain no private R2 review links or upload identifiers.

## Remaining ticket 02 work

- Complete durable edit/withdraw/Comment intent recovery and bounded production resource/scan acceptance
- Clean packed GitHub Installation and real account/public/private acceptance through the paired App service

Ticket 02 remains claimed until its full criteria pass. The owner-authorized Feedbax Core App and dedicated test service/portals have been deployed for acceptance. They are not a 0.2.2 release or a claim that the whole release scope is complete.

API contracts checked against [GitHub issue endpoints](https://docs.github.com/en/rest/issues/issues), [issue Comment endpoints](https://docs.github.com/en/rest/issues/comments), and [REST retry guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) on 2026-10-15. Tests use the GitHub HTTP seam and migrated D1/R2 rather than mocked SQL or internal collaborators.
