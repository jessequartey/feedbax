# Version 0.2.2 — GitHub integration and feedback operations

Status: amended owner-approved release scope; ticket 01 resolved, tickets 02/03/06 in progress. See the [acceptance record](version-0.2.2-acceptance.md) for implemented behavior, live evidence and remaining work.
Approved: 2026-10-15.
Start gate: 0.2.1 production acceptance and published release verified on 2026-10-15.

## Owner decisions — 2026-10-15

These amendments take precedence over the original scope below. The 0.2.1 gate is satisfied: production acceptance is recorded in [0.2.1 acceptance](version-0.2.1-acceptance.md), [v0.2.1](https://github.com/jessequartey/feedbax/releases/tag/v0.2.1) was published on 2026-10-15, and both npm packages resolve to 0.2.1. This is permission to start implementation, not evidence of any 0.2.2 delivery.

- **Defer new Team Member tools.** Do not add Team Member login, browser operation pages, privileged Feedbax runtime endpoints, or new Team Member CLI/bot commands in this scope. Keep native Notion/GitHub workflows. A capability requiring a new privileged tool is explicitly deferred; do not substitute Participant sessions or submission API keys for Team Member authority. Internal contracts may be designed now, but deferred operations are not delivered features.
- **Payload retention.** Delete raw webhook payloads after successful processing; delete failed payloads within seven days of receipt. Retain only sanitized diagnostics for at most 30 days. Bounded authoritative reconciliation must recover work after payload expiry. Apply deletion to queues, failure stores, and other service-owned copies; never place raw payloads in routine logs.
- **Restrictions.** Prevent future restricted actions. Preserve existing Votes unless a separate authorized moderation action explicitly removes them; a restriction alone does not change historical support or revoke read access.
- **Legacy merge counts.** Preserve per-source unverified counts and combine them as explicitly unverified, potentially overlapping support. Keep that number separate from unique verified Votes. Never rank verified support by a combined verified/unverified total.
- **Changelog order.** Newest release Date first, then newest Created At first, then immutable Slug ascending for exact ties. Apply this ordering before cursor pagination, including generated Installations. Package changelogs retain newest versions at the top.

### Deferred operations and release boundary

| Area                     | Still in scope                                                                                   | Deferred while Team Member tools are deferred                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub workflow          | Native labels/Project field, explicit approved public content, publication and release decisions | New portal/CLI/bot Team Member commands, engineering-reply publication tools                                                             |
| Duplicate Posts          | Identity/alias/union/recovery contract and native capability assessment                          | Executable merge workflow unless a safe native provider action meets all acceptance criteria                                             |
| My feedback/history      | Verified ownership, native observed status/public updates, release links                         | UI/actions that depend on an executable merge or new privileged publisher                                                                |
| Moderation               | Existing native removal, publication and Comment controls                                        | Private report review, verified restrictions, batch actions requiring new tools; never put a private report queue in a public repository |
| Health/recovery          | Read-only Deployer diagnostics, bounded automatic reconciliation                                 | Team Member status pages, manual replay/repair commands requiring new authorization                                                      |
| Upgrade/backup/migration | Deployer-owned lifecycle tooling with explicit source/credential control                         | Team Member runtime operations; no implicit authorization from Participant or submission credentials                                     |

The original full-scope acceptance list remains traceable below. Ticket 12 must evaluate the amended scope and list these deferrals explicitly. A deferred capability cannot pass its original completion criteria or be described as shipped. Tickets 05 and 10 require a safe native workflow or remain deferred; they do not block independent work. The workspace tracker at `.scratch/version-0-2-2/spec.md` records revised dependencies; the [implementation contract](version-0.2.2-contract.md) defines shared contracts.

## Handoff and release boundary

This document is the implementation handoff for 0.2.2. It includes GitHub integration and all seven product improvements selected by the owner. Deliver through sequenced implementation PRs targeting one 0.2.2 release; the size of this scope does not imply that it fits in one PR. Scope changes require an explicit owner decision.

The workspace tracker is `.scratch/version-0-2-2/spec.md`, with one implementation ticket per file under `.scratch/version-0-2-2/issues/`. Start with ticket 01 after the gate is satisfied. Existing 0.2.1 work, versioning, and production acceptance remain independent of this planning work.

Read `CONTEXT.md`, `SPEC.md`, relevant ADRs, and `TESTING.md` before implementation. This future release plan does not silently rewrite the current Notion contract. Ticket 01 records the necessary decisions and updates the canonical contract before behavior changes.

## Complete scope

| Workstream                                | Required outcome                                                                                                              | Tickets |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| GitHub integration and Feedbax App        | GitHub can replace Notion; one configurable official App, self-hosted alternative, optional Projects, public/private controls | 02–04   |
| 1. Merge duplicate Posts                  | Consolidate feedback without losing links, attribution, or verified support                                                   | 05      |
| 2. My feedback                            | Verified Participants can find their submissions, Votes, and Follows across devices                                           | 06      |
| 3. Decisions and progress history         | Safe public history, explicit decisions, and links to delivered updates                                                       | 07      |
| 4. Upgrades, backup, and restore          | Update a customized Installation and recover its content and operational data                                                 | 08      |
| 5. Integration health and recovery        | Detect stale integrations, recover missed work, and expose actionable diagnostics                                             | 09      |
| 6. Stronger moderation                    | Report abuse, restrict offenders, and process spam in batches                                                                 | 10      |
| 7. Import, export, and provider migration | Move feedback into, out of, and between supported providers while retaining identity                                          | 11      |

Ticket 01 establishes the contract and shared foundations. Ticket 12 verifies the complete release, documentation, and generated Installations.

## Cross-cutting rules

- One Installation continues to serve one Product Team and one product. Choose one authoritative content/workflow provider per Installation: Notion or GitHub. Continuous bidirectional Notion/GitHub synchronization is outside this release.
- Content provider, operational storage, and Participant identity are separate choices. D1 does not imply verified identity. Preserve existing Notion-only Installations without silently adding operational resources or changing their guarantees. Explicitly provision D1 when enabling new capabilities that need durable operational state; retain signed Identity Handoff for the Connected Profile.
- GitHub Installations require D1 for private metadata, stable mappings, delivery work, and recovery. GitHub use alone never requires Participants to have GitHub accounts. Reliable unique Votes, cross-device ownership, Follows, Notifications, and authenticated uploads retain their Connected Profile requirements.
- Preserve the six Post Status values: New, Reviewing, Planned, In Progress, Shipped, Closed. Publication remains independent of Post Status. Immutable public slugs survive title edits, merges, upgrades, and provider migration.
- Public pages, browser responses, caches, images, and Notifications use explicit public-field projections. Internal notes, contact details, credentials, edit capability material, and private engineering content stay private.
- Team workflow remains in the selected provider. Add narrowly scoped authenticated Team Member operations where the provider cannot express a Feedbax action safely; a second general-purpose management dashboard is outside this scope.
- New Team Member commands require server-side authorization against the configured Installation and provider access. A Participant session, display name, comment text, repository label, or submitted installation ID alone never grants Team Member authority.
- Use the existing deep Feedback and Changelog modules. Put provider differences behind real adapter seams, including Comments and publication, rather than spreading provider branches across routes. Avoid a generic plugin framework.
- Model retried and concurrent operations explicitly. Stable operation keys, durable checkpoints, bounded retries, and reconciliation must recover from partial provider/D1 writes without claiming cross-system transactions or exactly-once delivery.

## A. GitHub integration and Feedbax App

### Content and identity

1. Setup offers Notion or GitHub. A GitHub Installation starts without Notion credentials or a hidden Notion dependency. Support one feedback repository initially; explicitly connected development repositories may supply linked PRs.
2. A new Post creates one corresponding GitHub issue and a stable private mapping. Retries recover the same issue. The issue remains the persistent feedback record; implementation PRs link to it rather than replacing it. One Post may require multiple PRs.
3. Keep contact details, capability hashes, Participant mappings, idempotency metadata, and other private operational data in D1, including when the issue repository is public. Define a versioned, explicit public-content section/projection; internal issue notes and engineering discussion are never automatically public portal content.
4. Preserve configurable voting, Comments, Follows, Notifications, and Image Attachments under their existing identity and storage requirements. Portal Comments and developer issue comments are separate by default. Only an explicit Team Member action may publish an engineering reply as a Product Team Comment; preserve portal attribution without pretending the Participant is a GitHub user. Private R2 download authorization continues to apply.
5. GitHub-only setup offers Changelog disabled as an explicit supported choice for 0.2.2. Preserve the Notion-backed Changelog for Notion Installations. A GitHub Releases-backed Changelog is outside this release; reject unsupported enabled configurations with an actionable error rather than silently removing content.

### One configurable App

6. Provide one official Feedbax GitHub App. A Deployer installs it on an account or organization, selects repositories, securely pairs the Installation, and configures workflow and visibility. Prove control of both the GitHub resources and destination portal before binding them.
7. Operate the shared App through an integration service that owns the App private key and webhook receiver. Route by the verified GitHub installation, repository/Project mapping, and authenticated portal binding; one GitHub account may connect multiple Feedbax Installations without mixing their data. Authenticate outbound portal-to-service operations and service-to-portal deliveries with Installation-scoped credentials.
8. Keep the complete integration implementation and configuration schema in Apache-2.0 Core. Support the same implementation with a team-owned App registration and self-hosted integration service, including guided App Manifest registration. Document which private GitHub events pass through the official service. Store deployment secrets outside source control and public configuration.
9. Configuration includes portal binding, feedback repository, permitted development repositories, labels or Project workflow, status mappings, publication policy, GitHub-link visibility, and PR automation policy. Validate requested permissions and account/Project support during setup. Record an explicit supported matrix for personal and organization Projects; unsupported combinations must have the Issues-only fallback.

### Optional Projects and automation

10. Default to Issues-only. Provision dedicated `feedbax:new`, `feedbax:reviewing`, `feedbax:planned`, `feedbax:in-progress`, `feedbax:shipped`, and `feedbax:closed` labels. A separate `feedbax:published` label controls publication. Team Members can use the GitHub issue list without a Project.
11. Optionally configure one GitHub Project and map one single-select field to Post Status. Project mode makes that field authoritative; status labels are not a second authority. Publication remains a separate explicit control. Project removal, missing options, renamed fields, conflicting labels, or lost permissions produce diagnostics and retain the last valid projection. Publication revocation is handled separately and takes precedence over retaining stale public content.
12. The bot creates the initial issue and workflow metadata, adds issues to the configured Project, and observes status/publication changes. Linked active PRs may advance a Post to In Progress under an explicitly enabled policy. An arbitrary mention is not an implementation link. PR closure without merge does not imply Shipped or Closed. PR merge alone does not mean delivered; explicit Team Member release/status decisions remain authoritative. Describe precedence for manual decisions, reopening, multiple PRs, and Project native automations.
13. Register signed webhook processing, durable deduplication, queued work, retry/backoff, periodic authoritative reconciliation, permission-loss handling, and uninstall/repository-removal handling. Validate signatures against raw bodies and isolate every operation to its authenticated Installation. Recover stale or reordered events through current authoritative reads.

### Public and private projects

14. Private repositories are supported without exposing issue/PR URLs, titles, bodies, diffs, review discussion, or other engineering metadata to Participants. Publish only approved Post content, public updates, and mapped Post Status. Restrict Team Member links to authorized Team Member responses.
15. For public repositories, a Deployer may explicitly enable issue/PR links on Published Posts. Moderation remains the default portal publication policy. Offer automatic publication only as an explicit opt-in for public-repository Installations, with a clear explanation that public GitHub issue content is visible immediately, even if the portal Post is unpublished. Teams requiring private intake must choose a private feedback repository.

## B. Merge duplicate Posts

- Let an authorized Team Member choose a canonical Post and merge one or more duplicates into it through a supported provider action or authenticated Feedbax command.
- Keep immutable original URLs as safe aliases/redirects when the canonical Post is public; private or unpublished targets return the ordinary unavailable projection. Reject self-merges, cycles, and cross-Installation merges.
- Union verified Votes and Follows by Participant identity. One Participant contributes at most one verified Vote. Transfer Follows without changing email consent or manufacturing historical Notifications; preserve read and delivery history.
- Preserve Comment attribution, timestamps, original-Post context, and Image Attachment authorization. Use a durable alias/association strategy where native Comments cannot be moved safely. Preserve provider records as traceable duplicates rather than deleting history.
- Keep historical unverified Vote counts separate; merging cannot manufacture verified identity or support. Document a deterministic policy for installations using best-effort participation.
- Make interrupted merges resumable and idempotent. Record the Team Member, sources, destination, and outcome privately; publish only the safe merged-Post relationship.

## C. My feedback

- Add a private Connected Profile view with Submitted, Supported, and Following filters, pagination, empty/loading/error states, and cross-device persistence.
- Bind new signed-in submissions to the server-verified Participant subject. Never derive ownership from a submitted email or display name. Show the Participant their own pending moderation content and safe publication/lifecycle information without disclosing provider records or internal decisions.
- Retain the current browser-capability path for unsigned drafts. Link an existing draft to a verified identity only through valid browser-held authority and a confirmed server-side operation; email matching cannot claim historical Posts.
- Preserve the existing edit rule: only New, unpublished Draft Posts may be edited or withdrawn. Cross-device draft management for verified owners must not widen that lifecycle authority. Enforce ownership, session, and same-origin checks server-side.
- Follow merged Posts to their canonical identity while keeping the original submission understandable. Account for withdrawn, removed, and unavailable content without exposing other Participants' submissions.

## D. Decisions and progress history

- Show a public chronological timeline for Published Posts: observed Post Status transitions, explicitly public Team Member updates/decisions, safe duplicate relationships, and release links. Keep Team Response available as a concise current response.
- Store actor attribution privately; present public Team Member contributions as Product Team. Distinguish provider event time from Feedbax observation time. Polling can miss intermediate transitions: describe the history as observed history rather than a complete audit trail.
- Exclude private issue/PR events and internal notes. Publishing a Post does not retroactively publish private history. A default future-public event needs no private text; explicit public updates require an affirmative action.
- Link Shipped Posts to a Published Changelog Entry when available or an explicit safe release-notes URL. Validate URL schemes and target publication. GitHub-only Installations can use public release-notes URLs with Changelog disabled.
- Deduplicate events and Notifications across webhook retries, polling, merges, and migration. Unpublication/removal revokes public timeline and attachment access and prevents new public deliveries.

## E. Upgrades, backup, and restore

- Provide a supported upgrade flow from a released 0.2.1 Installation to 0.2.2. Record a generated-source baseline/manifest and compare baseline, local customization, and target source. Preview the change and surface conflicts before applying; preserve user edits rather than overwriting them.
- Treat source update, configuration migration, D1 migration, secret handling, and deployment as explicit stages. Make interrupted upgrades diagnosable and rerunnable. Document rollback compatibility before each migration; destructive transitions require a verified recovery path.
- Provide versioned backup/restore workflows covering provider content or restorable references, stable IDs/slugs, ownership/attribution, Votes, Follows, notification preferences and deduplication state, merge aliases, moderation/history, configuration, and private R2 objects/associations.
- A backup used for disaster recovery must include recoverable provider content, not only live provider pointers. Inventory credential dependencies separately. Exclude active sessions, replay nonces, capability secrets, and credentials from ordinary portable data archives; document reconnect/rotation and draft-capability invalidation on restore.
- Support an encrypted or explicitly protected recovery archive, checksums, schema/version checks, a dry-run manifest, attachment integrity checks, and restoration into an isolated Installation. Restoring must not resend old Notifications or contact Participants. Prevent a restored clone from operating simultaneously against the original provider bindings without explicit cutover.

## F. Integration health and recovery

- Extend `doctor` and authenticated operational status with last successful synchronization, backlog age/count, retry and terminal failure summaries, credential/permission problems, email delivery health, and attachment cleanup failures. Expose no secrets, contact data, or private issue/PR content.
- Public liveness remains minimal. Team Member diagnostics are authenticated and Installation-scoped; provider outages are distinguished from invalid configuration.
- Persist queued work, bounded retries/backoff, failure reasons, and safe replay/reconciliation operations. Replays must not duplicate issues, Votes, public events, or notification intents; document external email deduplication limits.
- Reconcile missed webhooks, out-of-order events, provider edits, schema drift, and restored mappings. Define and test configurable polling/recovery intervals and stale thresholds, with bounded per-run work. Report the last successful check so delayed public updates are understandable.
- Treat explicit unpublication, deletion, permission loss, and revoked App installations conservatively: stop unauthorized writes/deliveries and invalidate affected cached visibility. Show the Deployer how to repair or disconnect without deleting the Product Team's source content.

## G. Stronger moderation

- Add rate-limited reporting of published abusive Comments and Posts, a private review queue in the selected workspace, and authorized resolve/dismiss/remove actions. Reporter identity and contact data remain private; reporting alone does not remove legitimate content.
- Permit Team Members to restrict a verified Participant from submission, Commenting, and voting, with an explicit scope and reason. Anonymous controls remain best-effort; never claim a Device Profile identifies a person. Document how restrictions affect existing Votes and access, and use one tested policy across both providers.
- Add bounded batch spam actions with preview, authorization, partial-failure reporting, retry safety, and an action record. Use reversible hide/quarantine where possible. Hide affected public projections and attachments, invalidate caches, and suppress pending notifications for removed content.
- Keep private provider conversations separate from public Comments. Apply equivalent moderation rules through portal, trusted submission, and bot command paths; record an explicit policy for trusted server submissions rather than leaving a bypass accidental.

## H. Import, export, and provider migration

- Define a versioned portable archive shared with backup tooling, with explicit public/private field classifications. Supply a provider-independent export and validated import of Feedbax archives, plus a documented CSV mapping for existing feedback. Preview field/status mappings, required data, limits, and validation errors before writing.
- Preserve public slugs, original timestamps where representable, stable Post identity, merge aliases, verified ownership/attribution, Votes, Follows, consent, decisions, and attachment associations. Preserve unsupported imported fields as private metadata or report them explicitly. External names/emails and imported counts never become verified identity or Votes without authoritative evidence.
- Support Notion-to-GitHub and GitHub-to-Notion migrations with one writer at a time: preflight permissions/schema, snapshot, preview, pause writes/queue work, resumable copy, verify counts/checksums and sampled visibility, switch authority, invalidate caches, then resume. Preserve a rollback point until verification succeeds.
- Handle provider-native Comment limitations through preserved source context and Feedbax mappings; never impersonate original provider users. Explain any loss before confirmation and reject an unrepresentable migration rather than silently dropping content.
- Migration/import operations are resumable and idempotent, do not notify Participants about historical activity, and cannot bind another Installation's GitHub resources. Restoring or importing across trust boundaries requires explicit identity/issuer mapping; mismatched identities remain unverified and email consent does not transfer to an unrelated Product Team.

## Implementation sequence

1. **01:** verify the 0.2.1 gate, reconcile domain/ADRs, and define provider, identity, public projection, and operational data contracts.
2. **02–04:** implement the GitHub provider, shared/self-hosted App, optional Projects, and safe workflow automation. Build durable recovery primitives here; ticket 09 adds the complete operational experience.
3. **05–07:** implement duplicate merging, My feedback, and decisions/history against both providers. Evolve reusable operational records rather than creating disconnected stores.
4. **08:** implement upgrades and recoverable backups before exercising destructive cutovers.
5. **09–10:** finish health/recovery and moderation, including native provider workflows and all mutation paths.
6. **11:** implement portable import/export and reversible provider migration using ticket 08's archive/restore foundations.
7. **12:** reconcile all eight workstreams, generated Installations, documentation, reviews, real production evidence, and the 0.2.2 release.

Ticket dependency lines, rather than this summary, determine which work can start. A ticket is complete only when its acceptance evidence exists; publication of an implementation PR alone is insufficient.

## Release acceptance

- Preserve 0.2.1 behavior for existing Notion-only and Connected Installations; exercise feature opt-outs explicitly.
- Prove GitHub setup from a clean generated Installation with zero Notion credentials, for public and private feedback repositories, Issues-only and supported Project configurations, official and self-hosted App operation, and permission/uninstall recovery. Run two independently paired Installations to prove isolation.
- Exercise a real private issue/linked PR lifecycle. Inspect public HTML, serialized browser responses, caches, public Notifications, and image downloads for private engineering content. Public-link opt-in never overrides private-repository protections.
- Verify duplicate merge concurrency, unique Vote/Follower unions, old URLs, attributed Comments, image visibility, private ownership across two browsers, public observed history, restrictions, reports, and batch moderation.
- Upgrade a customized packed 0.2.1 Installation. Restore an isolated backup and verify content, consent, attachment integrity, and notification suppression. Complete both provider migration directions with failure/retry and rollback evidence.
- Test timeout/rate-limit handling, duplicate/reordered/missed deliveries, provider and D1 partial failures, stale permissions, and safe replay through module/HTTP seams and real migrated D1/R2. Extend `TESTING.md` for the GitHub HTTP and integration-service seams.
- Run repository format/lint, types, relevant behavior suites, production builds, deployment dry runs, template synchronization/checks, package checks, and secret scanning. Verify a clean packed generated Installation independently. Run keyboard and mobile browser checks for new Participant surfaces and Team Member operations.
- Capture evidence in a dedicated `docs/version-0.2.2-acceptance.md`, including the official service deployment and real account/Project support matrix. Record omissions honestly. Release the fixed `feedbax`/`create-feedbax` group as 0.2.2 through the established Changesets flow only after acceptance; publish release notes afterward.

## Explicit exclusions

AI implementation/automatic PR authoring, semantic duplicate detection, analytics dashboards, billing, a general plugin registry, continuous multi-provider synchronization, a general-purpose management dashboard, GitHub Releases-backed Changelog, new deployment platforms, and a Feedbax password-based identity system are outside 0.2.2.

## Primary GitHub references

- [GitHub App installation authentication and scoped access](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).
- [App Manifest registration for the self-hosted path](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).
- [Issue and PR linking, including default-branch closure semantics](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue).
- [Project field management](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) and [built-in automation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations).
- [Webhook delivery failures and redelivery](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries).

Verify current permissions, supported account types, and payload contracts against these primary sources when implementing; references are research entry points, not frozen API contracts.
