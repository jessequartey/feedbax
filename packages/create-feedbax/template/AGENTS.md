# Working on this Feedbax installation

Read `README.md` for local setup, configuration, and checks. Read `CONNECTED.md` when configuring identity handoff, D1, sessions, verified Votes, or Comment attribution.

This is a flat application, not the Feedbax development monorepo. Product settings are in `src/feedbax.ts`; infrastructure is in `wrangler.jsonc`; secrets are in ignored `.dev.vars` and encrypted Worker secrets. `src/feedbax.test-fixture.ts` is never a live configuration.

Use the copied shadcn primitives in `src/components/ui`. Keep the configured Geist font and theme tokens. After changes, run `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build`, fixing errors. Use `pnpm format:check` to check formatting.

For setup, `pnpm exec feedbax doctor` must pass with the selected provider’s real credentials/mappings and enabled bindings. For GitHub provisioning, pairing, native publication, public-repository exposure, or provider secrets, read the GitHub setup and publication section in README.md. GitHub requires dedicated D1 independently of Connected identity and disables Changelog. Bootstrap deployment remains unpaired until the GitHub authorization flow completes. Run `pnpm deploy:dry-run` before deployment and verify the actual live URL after `pnpm exec feedbax deploy`. Distinguish copied source, configured local readiness, and a verified deployment in the result.

## Connected social features

For following, in-app/email notifications, or image attachments, use the full Connected guide (CONNECTED.md in a generated app; docs/connected-profile.md in the source repository). Apply every included D1 migration, including the Follow baseline migration, configure the timer and dedicated processing queue for small mode, choose Cloudflare/Resend/custom email when required, and keep the R2 bucket private for images. Never use a Device Profile as verified email evidence. Run doctor and behavior checks; explicitly distinguish local tests from real sender delivery and production authentication acceptance.
