# Legacy replacement inventory

This inventory records the public repository state that the Feedbax 0.2.0
replacement branch started from. It is a replacement aid, not an architecture
source for the new Core implementation.

## Provenance

- Public repository: `jessequartey/feedbax`
- Default branch: `main`
- Replacement base: `5f5ff72`
- Preservation tag already present: `pre-rebuild-v0.0.2`
- Replacement branch: `replacement/0.2.0`

The canonical `origin` fetch and push remotes remain attached to the public
repository, and the full Git history is retained.

## Replacement constraints

- Keep the existing public repository and its history rather than initializing
  a new repository.
- Preserve continuity for the `feedbax`, `create-feedbax`, and `@feedbax/*`
  package identities while replacing their preview contracts through 0.2.0
  prereleases.
- Replace the current MIT licensing statement with the accepted Apache-2.0
  Core license before the replacement is released.
- Treat current public URLs, deployment names, and published setup instructions
  as migration inputs that require explicit replacement guidance; do not assume
  they remain valid.
- Keep secrets and live Notion credentials out of the repository and
  pull-request checks.

## Recoverable candidates

These items may be reviewed and deliberately reintroduced when the 0.2.0
contract calls for them:

- The existing Feedbax logo and favicon artwork.
- Package naming, Changesets history, and release-provenance lessons.
- Notion request fixtures and tests that encode still-valid external API or
  security behavior.
- Security tests covering sanitized failures, request bounds, origin controls,
  rate limiting, and secret handling where they match the new contract.
- Existing deployment and documentation URLs needed to write accurate
  replacement, rollback, and recovery guidance.

Every candidate must be checked against the current specification and ADRs
before it is ported. Existing code is not presumed compatible.

## Intentionally not ported as architecture

- Effect, Effect Schema, and the existing Effect runtime composition.
- Generic connector, identity-provider, interaction-store, or plugin systems.
- Voting, comments, following, notifications, changelog, duplicate detection,
  and verified identity behavior.
- Vercel and Docker deployment adapters.
- The existing multi-package service and adapter boundaries.
- Existing route handlers, portal feature components, and generated template
  structure merely because they already work.

The next slice removes the legacy application and scaffolds the pinned
Feedbax-owned TanStack Start workspace from the agreed Better-T-Stack
foundation. Useful behavior is recovered later only through the new Feedback
module, Notion HTTP, and Worker-handler seams.
