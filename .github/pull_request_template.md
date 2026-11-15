<!--
Read CONTRIBUTING.md first. One problem per PR. Drafts follow the same rules.
Title: a conventional commit in plain language, e.g. "fix(sync): stop duplicate GitHub issues".
-->

## Problem

<!-- One or two sentences. Expected vs actual, and how to reproduce if it's a bug. -->

## Change

<!-- How this fixes it. If it touches several areas (portal, admin, sync, CLI, docs), say why each is needed. -->

## Verification

<!-- What you ran and what you saw. Paste check results. "Tests pass" alone is not enough.
UI: before/after screenshots, light and dark, plus mobile width if layout changed. Upload them here; don't commit them. -->

- [ ] `npm run check && npm run typecheck && npm test`
- [ ] `npm run build && npm run verify:build` and the `scripts/test-worker-*.ts` checks
- [ ] `npm run cli:build && npm run test:package` (only if CLI, `packages/` or the template changed)

## Notes

<!-- Migrations (must be additive), new settings, Free-plan cost of any new background work, follow-ups. Delete if empty. -->

Closes #

<!-- Used an AI tool? Any model is welcome. Name the model and harness: "Model: <model> (<tool>)". -->
