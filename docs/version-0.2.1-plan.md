# Version 0.2.1 — Connected Profile foundation

Status: in development. Target version approved by the owner on 2026-10-15.

## Scope and sequence

1. Reconcile the shipped 0.2.0 roadmap and tracker; publish its Notion Changelog Entry and remove test content from public display.
2. Add an optional Connected Profile with D1 operational state managed through Drizzle. Notion remains authoritative for Posts, publication, Team workflow, and Comment content.
3. Authenticate Participants using signed identity handoff from the Product Team’s existing application. Bind each handoff to a browser challenge and Installation, expire it quickly, and consume it once. Use opaque, revocable, HttpOnly sessions. Never treat a Device Profile or client-submitted name as verified identity.
4. Store one Vote per verified Participant and Published Post with database-enforced uniqueness. Make add/remove idempotent and restore state across browsers. D1 is the authoritative count; historical anonymous counts are not verified Votes.
5. Store durable attribution for newly created native Notion Comments. Verify only Comments with recorded attribution; preserve historical unverified Comments and Product Team labeling. Keep Notion moderation effective. Fail closed on storage/authentication failures.
6. Integrate configuration, portal UI, generated installations, diagnostics, deployment instructions, and tests. Preserve the Notion-only Profile.
7. Open the implementation PR with a patch changeset targeting 0.2.1. Publish its Changelog Entry only after the corresponding work is complete and release evidence exists; do not describe planned work as shipped.

## UI refresh added 2026-10-15

Refresh the installed shared shadcn components from the current CLI/registry, retaining the Base UI Lyra theme, workspace aliases, explicit secondary-button behavior, and mobile accessibility adaptations. Register `@shadcn/lint` with the existing ESLint setup. Remove decorative background lines; replace the full-height spinner with a quiet content skeleton; rebuild the command palette composition around current shadcn Command primitives with clear asynchronous states and keyboard navigation.

Visual thesis: a quiet neutral workspace, clean surfaces, readable type, and generous search spacing.
Content plan: retain the feedback workspace and navigation; simplify the search field, result list, and keyboard footer; keep loading aligned to the content it replaces.
Interaction thesis: a brief dialog entrance, stable search results while loading, and a subtle skeleton pulse honoring reduced motion.

## Ownership

Jesse owns external adoption/design-partner interviews and custom domains in parallel. They are not prerequisites to this implementation. The unperformed human-authored Notion reply/resolve walkthrough remains an explicit adoption follow-up.

## Verification

Use the already accepted Feedback module, external adapter boundary, and Worker HTTP handler test seams. Prove invalid/expired/wrong-audience/replayed handoffs, browser binding, logout, CSRF rejection, duplicate and concurrent Votes, cross-device state, public-data privacy, spoofed Comment identity rejection, mixed historical/verified Comments, and fail-closed missing D1 configuration. Run repository quality gates and packed generated-installation checks before release readiness.

## Excluded

Feedbax email/password sign-in, following, notifications, Participant media, hosted billing, additional frameworks, and additional deployment platforms.
