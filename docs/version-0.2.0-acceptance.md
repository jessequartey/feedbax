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
2. Vote from feed and detail, remove the Vote, reload, and confirm browser-local state and Notion Vote Count agree. Force a failed mutation and confirm the optimistic state rolls back. Confirm Top and Trending match and New remains chronological.
3. Create a top-level Comment and reply. Confirm the display name is marked unverified and email is absent. Edit and delete within fifteen minutes from the originating browser. Confirm another browser has no capability. Reply, resolve, and delete from Notion; verify Product Team labeling and resolved/deleted hiding after refresh.
4. Publish several Changelog Entries in Notion, including one image and open-ended Labels. Confirm newest-first order, filtering, explicit pagination, title-derived image alternative text, and no detail route. Replace/remove the image directly in Notion and verify freshness without serving an expired reference.
5. Rotate the participation signing secret and confirm outstanding Participation Passes and Comment Capabilities are rejected.
6. Run `doctor` with mutation logging enabled. Confirm it always reads the canonical Feedback schema, checks Comments only when enabled, checks Changelog only when enabled, and creates or edits nothing.
7. Inspect generated `feedbax.ts` and build artifacts for Notion tokens, API keys, signing secrets, and Turnstile secrets. None may be present in typed public configuration.
8. Probe `/api/v1/posts`, `/internal/votes`, and `/internal/comments`. Confirm only trusted Post submission is a stable versioned mutation contract.

If a live external service is unavailable, mark that row unproved; an automated test or local mock does not replace the production Worker and dedicated Workspace evidence required for release acceptance.
