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

## Feedback discovery

Unfiltered Top focuses on unshipped feedback. Exclude Shipped Posts before pagination, while retaining explicit Shipped status filtering, search, New ordering, and roadmap access. Version the public cache identity so old cached Top projections do not retain the previous inclusion policy.

## Complete integration documentation

Provide an end-to-end authentication guide with a tested signed-handoff application endpoint, real session-adapter contract, deployment, browser verification, secret rotation, and troubleshooting. Provide an end-to-end feedback-block guide with a released installation command, secure product-server handler, browser component wiring, retries/idempotency, moderation, and optional related-Post integration. Verify the server examples against the actual portal contracts.

## Ownership

Jesse owns external adoption/design-partner interviews and custom domains in parallel. They are not prerequisites to this implementation. The unperformed human-authored Notion reply/resolve walkthrough remains an explicit adoption follow-up.

## Verification

Use the already accepted Feedback module, external adapter boundary, and Worker HTTP handler test seams. Prove invalid/expired/wrong-audience/replayed handoffs, browser binding, logout, CSRF rejection, duplicate and concurrent Votes, cross-device state, public-data privacy, spoofed Comment identity rejection, mixed historical/verified Comments, and fail-closed missing D1 configuration. Run repository quality gates and packed generated-installation checks before release readiness.

## Excluded

Feedbax email/password sign-in, video/general file attachments, hosted billing, additional frameworks, and additional deployment platforms.

## Post detail follow-up

Open the dialog shell immediately, match its loading layout to the final content, and render Post content without waiting for Comments on both dialog and canonical page. Remove the full-page toolbar. Put the composer above the scrollable thread list and use compact profile/sign-in prompts. Enforce the selected shadcn lint rules in source and generated apps.

Roadmap columns initially show five uniform cards, with two-line title and description previews and five more per View more action. Retain the backend cursor pages and total counts. Normalize portal headings to the shared shadcn type scale (24px page heading, 18px Post dialog title, 14px description), retain Geist and theme colors, and redesign Changelog as a readable release timeline with paragraph spacing and compact controls.

The portal includes a bottom-right Powered by Feedbax footer linked to GitHub and removes the redundant Posts heading from Feedback. The repository and generated app include clear README/AGENTS setup instructions, including the supported --template-only path and distinct local/deployed completion checks.

## Expanded Connected scope — owner approved 2026-10-15

Add explicit per-Post following, private in-app and opt-in email notifications, and image-only attachments to new Posts and Comments. Cloudflare Email Service, Resend, and custom HTTPS sending are supported choices. D1 stores Follows, observations, deduplicated Notifications, delivery state, and image associations; private R2 stores image bytes. Bounded scheduled work observes direct Notion changes and retries email/cleanup. Optional verified email assertions extend existing signed handoffs without creating Feedbax email sign-in.

Visual thesis: the same quiet shadcn workspace, with a small header bell, readable inbox rows, and compact image previews. Content plan: one Follow control per Post, one private inbox with read/email controls, and an image picker alongside each creation form. Interaction thesis: stable loading and error states, clear upload progress, and existing restrained dialog transitions. Feedback list descriptions use two-line previews; full descriptions remain in Post details.

See ADR-0030 and the expanded sections of connected-profile.md for behavior, setup, limits, and acceptance. This scope reopens implementation and review; prior foundation acceptance does not prove the added capabilities.
