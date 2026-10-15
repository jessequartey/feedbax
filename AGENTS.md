# Working on Feedbax

Read `CONTEXT.md` and `SPEC.md` before engineering changes. Read relevant decisions in `docs/adr/` when changing a domain or architecture boundary. Follow `TESTING.md` for behavior checks.

For installing a portal, configuring credentials, running the repository, or handing setup to another agent, follow `docs/agent-setup.md`. It distinguishes the published package from unreleased source and lists the required inputs and completion checks.

Use the existing shadcn primitives in `packages/ui`. Keep Geist and theme tokens; run `pnpm lint` and fix its errors after UI changes. Do not reapply a full preset over customized source. Refresh individual components as described in `docs/shadcn-refresh-0.2.1.md`.

Before delivering code changes, run the appropriate checks from `TESTING.md`, keep the generated template synchronized with `pnpm template:sync`, and verify `pnpm template:check`. Never claim a production release or deployment from local build evidence alone.
