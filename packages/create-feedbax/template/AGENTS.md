# Working on this Feedbax installation

Read `README.md` for local setup, configuration, and checks. Read `CONNECTED.md` when configuring identity handoff, D1, sessions, verified Votes, or Comment attribution.

This is a flat application, not the Feedbax development monorepo. Product settings are in `src/feedbax.ts`; infrastructure is in `wrangler.jsonc`; secrets are in ignored `.dev.vars` and encrypted Worker secrets. `src/feedbax.test-fixture.ts` is never a live configuration.

Use the copied shadcn primitives in `src/components/ui`. Keep the configured Geist font and theme tokens. After changes, run `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build`, fixing errors. Use `pnpm format:check` to check formatting.

For setup, `pnpm exec feedbax doctor` must pass with real Notion credentials/mappings and enabled bindings. Run `pnpm deploy:dry-run` before deployment and verify the actual live URL after `pnpm exec feedbax deploy`. Distinguish copied source, configured local readiness, and a verified deployment in the result.
