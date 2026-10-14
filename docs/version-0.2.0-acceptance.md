# Version 0.2.0 acceptance

Use a dedicated Notion Workspace and a production Worker. Record dates, Worker version, browser, Notion page/Data Source links, and pass/fail notes without copying secrets.

## Automated gates

Run `pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`, and `pnpm deploy:dry-run` from the repository root.

## Capability matrix

Repeat the Worker smoke cycle with all capabilities enabled, then with voting, Comments, and Changelog independently disabled. For each configuration, run `doctor`, open `/`, a Published Post detail page, `/roadmap`, and `/changelog`, and exercise the command palette.

| Configuration      | Expected result                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| All enabled        | Vote controls and counts, Comment Threads, and Changelog navigation/route work.                             |
| Voting disabled    | New is the only ordering; Vote controls and counts are absent; Comments and Changelog still work.           |
| Comments disabled  | Comment UI and internal Comment handlers are unavailable; voting and Changelog still work.                  |
| Changelog disabled | Changelog navigation/actions are absent and `/changelog` returns not found; voting and Comments still work. |

## Browser and Notion acceptance

1. Preview setup before every Notion mutation. Confirm Feedback contains Vote Count even with voting disabled and a newly created Changelog Data Source has no entries.
2. Vote from feed and detail, remove the Vote, reload, and confirm browser-local state and Notion Vote Count agree. Force a failed mutation and confirm the optimistic state rolls back. Confirm Top is the default, legacy Trending URLs resolve to Top, and New remains chronological.
3. Create a top-level Comment and reply. Confirm the display name is marked unverified and email is absent. Edit and delete within fifteen minutes from the originating browser. Confirm another browser has no capability. Reply, resolve, and delete from Notion; verify Product Team labeling and resolved/deleted hiding after refresh.
4. Publish several Changelog Entries in Notion, including one image and open-ended Labels. Confirm newest-first order, filtering, explicit pagination, title-derived image alternative text, and no detail route. Replace/remove the image directly in Notion and verify freshness without serving an expired reference.
5. Rotate the participation signing secret and confirm outstanding Participation Passes and Comment Capabilities are rejected.
6. Run `doctor` with mutation logging enabled. Confirm it always reads the canonical Feedback schema, checks Comments only when enabled, checks Changelog only when enabled, and creates or edits nothing.
7. Inspect generated `feedbax.ts` and build artifacts for Notion tokens, API keys, signing secrets, and Turnstile secrets. None may be present in typed public configuration.
8. Probe `/api/v1/posts`, `/internal/votes`, and `/internal/comments`. Confirm only trusted Post submission is a stable versioned mutation contract.

If a live external service is unavailable, mark that row unproved; an automated test or local mock does not replace the production Worker and dedicated Workspace evidence required for release acceptance.

## Recorded release verification — 2026-10-14

The release was exercised against fresh Notion storage created by the guided generator and a dedicated production Worker at `https://feedbax-release-acceptance.jessefquartey.workers.dev`. The generated application used its own literal typed identifiers and product identity, and the lifecycle CLI successfully diagnosed, built, and deployed it with encrypted secrets. No production credentials appear in this record.

| Configuration         | Result                                                                   | Verified at (UTC) |
| --------------------- | ------------------------------------------------------------------------ | ----------------- |
| Voting disabled       | Pass: New ordering; no Vote controls or Top; Vote handler rejects writes | 23:28             |
| Comments disabled     | Pass: discussion removed; Comment handler rejects writes                 | 23:29             |
| Changelog disabled    | Pass: navigation absent and route returns 404                            | 23:30             |
| All enabled, restored | Pass: Vote controls, Comments, and Changelog work                        | 23:32             |

Live checks passed for health, invalid API-key rejection, trusted submission and idempotent retry, unpublished moderation defaults, direct Notion publication, public private-field exclusion, Team Response and safe release links, Vote add/remove, native Comment creation/reply/edit/delete, Changelog publication, and image rendering. Signing-secret rotation invalidated a previously working unexpired Comment Capability after the new Worker version propagated. API-key rotation rejected the previous key, accepted the replacement, and synchronized the local hash.

Browser checks in the Codex browser covered profile creation, Post creation, browser-held draft access, in-place editing, and withdrawal confirmation/cancellation. The withdrawal mutation and failure rollback are also covered by automated tests. The live portal and documentation deploy at `https://feedbax.jessefquartey.workers.dev` and `https://feedbax-docs.jessefquartey.workers.dev`; official custom-domain attachment is deferred by the owner.

The source suite contains 289 passing tests. Generated-project behavior tests use an explicit all-capabilities configuration fixture; `doctor` separately compiles and validates the actual `src/feedbax.ts`. A generated project with all three capabilities disabled passed all 234 of its behavior tests. Packed installs are checked independently through type checking, linting, tests, production build, and Wrangler dry run. Portal JavaScript is bounded to 400 KiB gzip total and 250 KiB per chunk.

External design-partner installations and interviews have not been performed by this release run. They require real Product Teams and are not represented by the dedicated technical acceptance Installation. Native human-authored reply/resolve actions in the Notion UI remain a manual adoption check; the HTTP boundary suite covers author classification and resolved-Comment hiding. Turnstile is optional and disabled on the current dogfood Installation; typed browser/server enablement and fail-closed secret handling are covered by tests.
