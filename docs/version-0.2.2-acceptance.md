# Version 0.2.2 acceptance

Status: in progress. This record does not authorize a release or claim completion of the release contract. New Team Member tools remain deferred under ADR-0036.

## Resources and access

On 2026-10-15 the owner authorized dedicated test repositories and deployment into their existing Cloudflare account. The public and private fixtures were seeded from their old `jessequartey/class-grouping` project without changing that original repository.

- [Public feedback fixture](https://github.com/jessequartey/feedbax-acceptance-public)
- [Private feedback fixture](https://github.com/jessequartey/feedbax-acceptance-private)
- [Feedbax Core App](https://github.com/apps/feedbax-core), installed on those two selected repositories only, with Issues read/write and metadata read. The shorter App name is reserved by GitHub.
- Integration service: `https://feedbax-github.jessefquartey.workers.dev`, with a dedicated D1 database and minute delivery processing.
- Portal targets: `https://feedbax-022-public.jessefquartey.workers.dev` and `https://feedbax-022-private.jessefquartey.workers.dev`, each with its own D1 database. Both generated portals are deployed and paired through the same App installation with separate credentials and repositories. The private portal enables Connected identity; the public portal does not.

Registration credentials are held only in ignored local files with restrictive permissions and Cloudflare secrets. Routine Worker observability is disabled for the test service/portals. The service does not persist raw webhook bodies; receipts and downstream work contain opaque identities and sanitized state.

## Verified so far

- GitHub App registration and the selected two-repository installation completed in the signed-in owner account.
- Three dedicated D1 databases created. The private portal database was created after the owner freed account quota.
- Service migrations 0001–0003 applied and the configured Worker deployed. `/v1/info` returned the registered App identity and bot identity. The reviewed generation fence is deployed in service version `65ec9fbb-fefc-441e-92f4-9973299577a6`.
- Real migrated local D1 tests cover pairing/callback replay, directional request authentication, webhook deduplication, failed delivery and resource revocation. A polling fairness regression proves one unavailable portal cannot prevent the next portal being scheduled.
- Portal reconciliation tests cover bounded backoff, concurrent worker fencing, revoked delivery rejection, and invalidation of cached access after local revocation.
- Follow-up review tests cover stale-generation revocations, pairing rotation during webhook ingress, continuation despite newer poll receipts, idle diagnostic expiry, Comment response-loss recovery, definitive rate-limit resumption, and transient attribution/attachment recovery with real migrated D1/R2. An attached image cannot create another Comment under a different intent.
- Local provider/HTTP/UI tests cover GitHub without Notion/verified identity, browser submission recovery, verified ownership, private My feedback filters and editing without a Browser Capability on another verified device.
- Optional `history: true` is implemented for both configured providers through the shared Feedback projection. Tests cover public baselines, no private backfill, concurrent/expired observers, transactional D1 failure recovery, pagination, no-store HTTP output and published local release-link validation. Live GitHub history checks below passed. A real Notion provider with local migrated D1 also passed baseline, approved transitions, retry deduplication and unpublication; this is not a deployed Notion history browser check.

## Live checks on 2026-10-15

- Both generated Workers built and deployed; their health endpoints responded successfully. The public and private pairing callbacks returned `paired: true`.
- Trusted submissions returned New Posts with stable slugs and created App-authored issues in the intended repositories. No capability/contact/idempotency metadata appeared in their issue bodies.
- Native GitHub edits added explicit approved content plus separate publication and Planned labels. Both portals rendered only that approved content. Test engineering titles/notes, repository IDs/names, and contact markers were absent from the inspected private portal HTML. Its response was `no-store`.
- The public portal accepted and persisted a browser Vote and an App-authored portal Comment with unverified attribution. The Comment body on GitHub contained only its explicit public section and no email.
- A browser submitted an unpublished draft, recovered browser-held editing access on its private draft view, edited its title, and retained the original slug. Live withdrawal remains pending.
- Real scoped tokens ignored client-supplied repository IDs. Cross-binding signatures and portal deliveries returned 401. Tokens could not PATCH the other repository's test issue; the public binding could not read the private repository. Installation-scoped status responses exposed no other binding or credentials.
- After the recovery deployment, both bindings again passed real isolation checks; each reported zero pending work and zero terminal failures.
- Both portal databases received migration 0009 and both portals explicitly enabled history. Versions: public `a72a057b-24d2-4c3d-856a-9f832ce46ea5`, private `429e29f7-39bc-44f3-8499-b6fb9c654e45`. Native In Progress label/approved Team Response changes appeared once per portal; repeated reads retained the same event IDs. Public history was `no-store` and contained no engineering/contact/provider/actor markers. A private GitHub issue URL placed in the approved release field was suppressed from portal HTML.
- The private timeline rendered at 390×844 with readable status/update entries and no horizontal overflow visible. Removing publication while status labels conflicted returned `available: false` and no events; the browser showed Post unavailable with no timeline. The disposable fixture was then restored to one valid status and publication. This is a visual/mobile check, not a complete keyboard or multi-browser acceptance claim.
- Clean packed creator/CLI archives produced a Notion Installation that passed 322 tests, types/lint/build and deployment dry-run after the recovery fixes. Reconfiguring that same packed Installation for GitHub passed types/build and a scan of all client assets and source maps for private binding/repository/runtime-secret sentinels. Repository validation passed 400 tests across 67 files, types/lint, production builds, formatting, synchronized-template checks and a 733-file tracked secret scan. Later release work requires another final check.

Two live-environment issues were corrected during pairing: same-account Worker routing requires the explicit public-fetch compatibility flag, and bot identity lookup uses the already authorized user token during pairing rather than shared anonymous API capacity. See [Cloudflare fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/). GitHub setup now includes that compatibility flag.

- A real Notion history fixture was moved to recoverable Trash after the provider/local-D1 checks. The existing production content was unchanged. The private GitHub portal also passed keyboard Skip to content and exposed its named history list; full keyboard and multi-browser acceptance remains open.

- Owner-requested UI refinement deployed to both fixtures: Comments opens by default, Activities contains progress, the explanatory paragraph is removed, and Follow controls are hidden until Connected sign-in. Private portal browser checks confirmed both panels and arrow-key switching in both directions. A public portal browser check confirmed an unsubmitted Comment survived a round trip through Activities; the test draft was cleared without posting. Versions: public `b87c8d13-4883-4dad-80ec-056390e14394`, private `3336fce8-4fc7-456e-81df-3fca658ae4d2`. Existing Post/Comment/Connected interaction tests passed (13 tests), along with portal types, lint, synchronized-template validation and both production builds. This does not resolve the remaining release acceptance below.

## Source-upgrade milestone

The development CLI now provides source-only `upgrade --from 0.2.1` preview, explicit apply, status, resume and guarded rollback. Its target is bundled from the synchronized flat template; the released baseline comes from the exact npm creator archive with pinned SHA-512 integrity. The source journal records baseline/local/target file hashes and changed-file preimages with private permissions. Configuration and credentials are preserved; data/schema/deployment work is separate. See [the upgrade guide](../apps/docs/content/docs/guides/upgrading.mdx).

A fixture was generated by the actual published `create-feedbax@0.2.1`, then customized with CSS, product configuration and an extra branding asset. Preview reported no conflicts; application preserved those edits. With the newly packed development CLI selected for dependency checks, it passed 329 tests, types, production build and deployment dry run. Source rollback restored the released generated files and preserved those customizations. A second apply/rollback cycle with the latest CLI passed. This is local source/build evidence, not a provider-data restore or production rollback.

The source suite passed 418 tests across 72 files. New lifecycle tests exercise real Git/filesystem conflicts, interrupted apply and rollback, operation locking, credential/configuration exclusion, tampered baseline rejection, wrong-directory refusal and concurrent edits. Standards review found no actionable issue; Spec review identified a concurrent-edit preservation gap, now fixed by per-file checks before rename/deletion and covered by real filesystem watcher tests. Packed Notion/GitHub checks and repository types/build/lint passed. Full archive, isolated restore, both provider migrations, deployment/capacity and remaining live acceptance are still required. Package versions remain 0.2.1 with future Changesets.

## Pending acceptance

Record actual results, dates and limits here as they are exercised. Still pending: remaining Comment/draft/revocation cycles; browser ownership/capability claims; real Workers processing limits; supported Project setup; existing Notion regression; lifecycle upgrade/archive/restore/migration; final reviews and package checks. Unit tests are not substitutes for these live checks.

## Recovered live interruption

At approximately 12:43 UTC on 2026-10-15, all three new `*.jessefquartey.workers.dev` hosts stopped resolving from the local/browser environment. Earlier live results above were recorded before this interruption. The private fixture's publication label had been removed with conflicting status labels for a visibility test; its final read remained unverified during the outage. Local source/package/documentation work continued independently.

At 14:23 UTC the service health endpoint resolved and returned 200 again. The previously interrupted private Post read then rendered the unavailable state with neither approved title nor engineering sentinel, despite conflicting status labels. The fixture was restored to Planned/published after that check; a fresh read rendered its approved title again without the engineering sentinel. The cause of the DNS interruption was not established; no capacity or availability guarantee follows from these checks.
