# W5 integration handoff

W5 implements the CLI and consumes the frozen W2 `NotionSetupClient` and
`GitHubSetupClient` interfaces. It does not copy a Notion schema, provider client,
or application template. No W0/W1/W2/W3/W4/W6-owned file was edited.

## Required integration work

1. Merge W2's `src/integrations/{notion,github,notion-schema}.ts`. Run
   `npm run cli:build` again: it automatically bundles those real factories into
   `dist/providers.mjs`. Until then, `scripts/cli-build.ts` emits an explicitly
   unavailable factory module, marked `// TEMP until W2 merges`; injected clients
   work in tests. There is no provisional schema to remove or reconcile.
2. Merge W1's `src/server/functions.ts`. W0's current stub imports
   `../../tests/fixtures/portal.ts`, which W0's template allowlist correctly omits.
   Real generated-app builds fail on that import with npm, pnpm and bun.
   `test:package` deliberately fails this gate rather than shipping test fixtures.
3. The root is not a workspace. CI/release must run
   `npm ci --prefix packages/create-feedbax` as well as root `npm ci`, before root
   typecheck/tests/build scripts. The CLI's exact `@clack/prompts@1.9.0` dependency
   and lockfile are package-local; W5 did not change W0's root package manifest.
4. Publish the Notion template with
   `NOTION_TOKEN=… npm run notion:template -- --parent-page <id-or-url>`.
   W2's `createTemplatePage` owns the exact schema, guide blocks and no-sample-row
   policy. Manually enable **Allow duplicate as template** in Notion, then replace
   `NOTION_TEMPLATE_URL` in `packages/create-feedbax/src/links.ts`. W6 wires that
   exact URL into the root README and enforces the placeholder release gate.
5. Run credentialed acceptance on dedicated resources after integration. This
   branch made no real Notion/GitHub/Cloudflare writes and deployed nothing.
   `npm run test:acceptance` prints the opt-in procedure. With
   `FEEDBAX_ACCEPTANCE=1`, explicit CLI flags and env credentials, it provisions
   and deploys; the instructions then require the real post/image/status and
   GitHub issue round trips. Those round trips are not automatically claimed.

## Verified behavior and deliberate choices

- Real Clack prompts, masked secrets, defaults, all product questions before
  Cloudflare, dependency installation in the background, and clean cancellation.
  The recording caught and fixed Enter-on-default validation. See
  `interactive-flow.raw.txt` and the cleaned `interactive-flow.txt` excerpt.
- Persistent state is the generated app's config, `.dev.vars` and Wrangler
  bindings, with no separate setup journal. Ownership is persisted immediately
  before resource mutation; re-listing resources adopts a successful request
  whose response was lost. Before ownership is recorded, every run still checks
  for name collisions. Secrets survive failed installs, migrations and deploys.
- R2 uses a read-only bucket-list preflight before any Cloudflare creation. A
  disabled-account response gets the exact enablement guidance and an in-place
  retry. Create-time enablement errors also retry. No temporary bucket is made.
- Pinned Wrangler 4.162.0 provides `whoami --json`, `auth token --json`,
  `d1 list --json` and `d1 info --json`; the parser tests use those object shapes.
  Its `queues list` has no `--json`, so collision checking uses the paginated
  Cloudflare Queues REST endpoint. Creation still uses the local Wrangler.
- A 0600 temporary JSON supplies all production secrets, excluding local
  `PORTAL_URL`, to the first `wrangler deploy --secrets-file`. `finally` removes
  it. `.dev.vars` is 0600 and gitignored. Child errors are redacted; malformed
  saved secrets produce a generic error without quoting their contents.
- GitHub checks token identity and repository issue read access, rejects archived
  repositories and disabled Issues, and never creates a test issue. The precise
  spec-required message explains that write access is checked by the first
  approved issue. The prefilled token URL was opened in the shared browser, but
  GitHub redirected to sign-in, so `issues=write` could not be visually verified.
  The CLI explicitly instructs **Issues: Read and write** as the safe fallback.
- npm omits nested `.gitignore` files. The CLI build transports W0's exact file
  as `_gitignore` and scaffold restores it; the package test asserts that
  `node_modules` and `.dev.vars` remain ignored. The manifest license matches
  the repository's Apache 2.0 license.
- `test:package` checks tarball launches via the installed npm, pnpm and bun;
  invokes the packed CLI non-interactively with injected frozen-interface
  providers and real stub binaries on PATH; verifies files, secret permissions,
  deploy cleanup and rerun; then really installs/builds the generated app with
  all three managers. No test-only provider flags are exposed to end users.

## Acceptance evidence

- `npm run check`: passes with no warnings, lint errors or type errors.
- `npm run typecheck`: passes.
- `npm test`: 158 passed (95 W5 tests plus 63 W0 harness tests).
- `npm run build`: passes (client + Worker).
- `npm run cli:build`: passes with the explicit W2/W1 integration notices above.
- `npm run test:package`: tarball launches, packed CLI E2E, resume and secret
  assertions pass; real npm/pnpm/bun installs pass; generated builds fail at the
  W0 fixture import. Real W2 factories remain a required release gate.
- `npm run test:acceptance`: opt-in help path passes; no credentialed run.
