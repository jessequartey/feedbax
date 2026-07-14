# Pre-rebuild baseline

- Source commit: `714789f`
- Preservation tag: `pre-rebuild-v0.0.2`
- Recorded: 2026-07-14
- Command: `pnpm type-check`
- Result: 20 Turbo tasks passed across 13 workspaces.

## Portal production bundle

The baseline portal production build completed successfully. The primary client entry was 423.09 kB raw / 131.79 kB gzip, the shared error-state chunk was 145.02 kB raw / 41.55 kB gzip, and route CSS was 33.71 kB raw / 7.20 kB gzip. These figures are comparison evidence; the rebuild release budgets remain authoritative.

## Package-name prerequisite

Registry checks on 2026-07-14 returned `E404` for `feedbax`, `create-feedbax`, and `@feedbax/core`. Availability is not ownership: maintainers must secure the names and scope before prerelease publishing.
