# create-feedbax

## 0.2.3

No changes in this release.

## 0.2.2

### Patch Changes

- 7d4e6b7: Add GitHub as an alternative Content Provider with Issues-only status/publication labels, explicit approved public content, private D1 mappings, and a shared or self-hosted GitHub App service. Keep the App key in the service, scope portal credentials to their selected repository, authenticate delivery in both directions, and recover uncertain Post/Comment writes without blindly duplicating them. Existing Notion Installations retain their configuration and storage footprint.

  Add private Connected My feedback with Submitted, Supported and Following views, verified ownership for new signed-in submissions, cross-device editing of eligible drafts, and explicit capability-backed linking of old browser drafts. Add opt-in Observed History with D1, public baselines, transactional checkpoints, bounded polling and publication-aware visibility. Display Comments and Activities in separate tabs; hide Follow controls until sign-in.

  Provide reviewed source-only upgrade preview from the pinned published 0.2.1 creator baseline, private three-way diffs, customization preservation, protected configuration and credentials, resumable source operations and guarded rollback. Document separate configuration, dependency, database, credential and deployment stages. Full data archives, isolated restore and provider migration remain follow-up work.

  Sort Changelog Entries by release Date descending, Created At descending and immutable Slug ascending before pagination. Refresh compatible packages, use stable TanStack Start, and pin Node 24 LTS for development and CI. Update package/generated READMEs and provider, authentication, submission, deployment, security, history and upgrade guides.

  Optional Projects/PR automation, remaining live/capacity acceptance and new Team Member tools are not delivered by this accepted release cut. The dedicated App service is an acceptance deployment, not a generally available managed service.

## 0.2.1

### Patch Changes

- de41e3d: Add the optional Connected Profile with signed identity handoff, D1 operational state, unique Votes per verified Participant, and durable attribution for native Notion Comments. Include the D1 migration, configuration and integration guide in generated Installations, validate Connected prerequisites in doctor, and deploy the server-only identity handoff secret. Notion-only Installations retain their existing behavior.

  Refresh the installed shadcn component baseline and dependencies, register the shadcn lint plugin, simplify loading placeholders, remove decorative background lines, and rebuild the command search layout with clearer results and keyboard guidance.

  Exclude Shipped Posts from unfiltered Top feedback before pagination. Keep Shipped Posts discoverable through explicit status filters, search, New, and the roadmap, and version cached public projections for the new policy.

  Complete the authentication and feedback block setup guides with tested server examples, application adapters, credential handling, verification steps, and troubleshooting.

  Enforce theme colors, known Tailwind classes, and inspectable component classes through shadcn lint in the workspace and generated Installations. Improve Post dialog and full-page loading, move the Comment composer above a scrollable thread list, and replace large profile gates with compact shadcn Items.

  Show five uniform roadmap previews per column with incremental View more, use the shared type scale throughout the portal, simplify the changelog timeline, and add the GitHub-linked Feedbax footer. Include informative repository and owned-app setup instructions for people and agents.

  Add explicit per-Post following, private in-app and opt-in email notifications, Cloudflare Email Service/Resend/custom HTTPS sending, and private image attachments on new Posts and Comments. Include scheduled Notion synchronization, durable retries/unsubscribe, verified email assertions, image moderation links and cleanup, installation diagnostics, and complete setup guidance. Truncate Feedback list descriptions to two lines.

  Default Connected processing to small batches for Workers Free with Resend/custom email, and retain explicit standard batches for Workers Paid. Use Workers-compatible manual redirect handling so email requests work at the edge without forwarding provider credentials to redirected destinations.

  Dispatch small-mode scheduled processing through a dedicated Cloudflare Queue so the timer stays within Workers Free's CPU allowance. Include bounded queue configuration and diagnostics. Prepare existing Follow Comment history across background pages, expose cancellable preparation, and distinguish new Comments and status changes despite minute-rounded Notion timestamps. Apply every bundled D1 migration before deploying the updated Connected Worker.

## 0.2.0

Generate a flat TanStack Start application with locally owned Feedback, Changelog, configuration, and UI source. Guided setup creates or validates Notion storage, configures voting and Comments independently, creates six team views, offers Turnstile, and runs diagnostics before deployment. Installations include best-effort voting, native Comment discussions and temporary editing capabilities, a Notion-backed Changelog, moderated submissions, a roadmap, and a trusted submission API.
