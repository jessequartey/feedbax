# Feedbax GitHub integration service

This Worker holds the GitHub App key for paired Feedbax portals. The official App and a team-owned App use this same open-source service. A portal receives short-lived access scoped to its verified Feedback Repository; it never receives the App key. Participant sign-in remains a separate Connected Profile capability.

## Deploy a service

Use Node 24 LTS and the repository's pnpm version. Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`; choose a distinct Worker, account, D1 database, and delivery Queue. Configure `SERVICE_ORIGIN` and exact `TRUSTED_PORTAL_ORIGINS`. Apply `migrations/` to `FEEDBAX_APP_DB` with Wrangler. Do not point this binding at a portal's D1 database.

From the repository root, install dependencies with `pnpm install --frozen-lockfile`. Then, from this directory:

```sh
cp wrangler.example.jsonc wrangler.jsonc
pnpm exec wrangler login
pnpm exec wrangler d1 create feedbax-github-service
pnpm exec wrangler queues create feedbax-github-delivery
# Fill in wrangler.jsonc with the database ID, Queue name in both bindings, and exact origins.
pnpm exec wrangler d1 migrations apply FEEDBAX_APP_DB --remote --config wrangler.jsonc
```

Apply all included service migrations before each service upgrade; these are separate from the generated portal's migrations. Migration 0003 fences queued work to the binding credential version, so an earlier revocation cannot revoke a newly authorized pairing. It completes old work whose original active binding version cannot be proved; hourly authoritative recovery replaces those notifications. Migration 0004 adds indexed delivery dispatch, recovery checkpoints and outage cooldowns. Existing receipts and work tombstones are preserved.

For a `*.workers.dev` portal, the configured platform hostname is used directly. Keep `global_fetch_strictly_public` in both service and GitHub portal compatibility flags for Worker-to-Worker routing; this is included in the example and generated GitHub setup. A custom portal origin requires an explicit Cloudflare Service Binding: add the binding to Wrangler and set `PORTAL_SERVICE_BINDINGS` to a JSON object mapping that exact HTTPS origin to the binding name. Arbitrary custom-domain DNS is never used for pairing or delivery, avoiding private-network and DNS-rebinding destinations. No redirects are followed.

Run from this directory:

```sh
node scripts/register-app.mjs https://YOUR-SERVICE.YOUR-ACCOUNT.workers.dev
```

Open the printed loopback URL. GitHub asks you to name and register the App. The manifest requests Issues write and metadata read on repositories you explicitly select. `--public` makes the App available for other accounts, as needed for the official shared service. Registration writes the App ID, client credentials, webhook secret, private key, and an independent service signing secret directly to ignored `.secrets.json` with owner-only permissions. No credentials are displayed in the browser. Preserve this file in your private recovery system and restrict its access. Never commit it or copy it to portals.

Deploy with the actual private configuration and secret file:

```sh
pnpm exec wrangler deploy --config wrangler.jsonc --secrets-file .secrets.json
```

Install the App on selected feedback repositories using the registration's install URL. Install/uninstall and repository-selection webhooks are automatically handled alongside Issues and Comment events. This initial Issues-only manifest does not request code contents, diffs, organization Projects, or development-repository access.

## Pair a portal

Generate a GitHub portal with `create-feedbax` or `provisionGitHubInstallation`. Explicitly provision `FEEDBAX_DB`, apply the included migrations, and deploy once with `feedbax deploy --pairing-bootstrap`. This verifies source/schema readiness while intentionally skipping the still-unpaired binding check. Content is unavailable until pairing finishes.

From the generated portal, run:

```sh
pnpm exec feedbax pair-github GITHUB_APP_INSTALLATION_ID
```

The command reads the server-only bootstrap secret from ignored configuration and starts a ten-minute, one-use exchange. Open the printed GitHub authorization link. The service verifies the authorized GitHub user's installation/repository access and repository write permission, scopes an App token to that repository, and challenges the exact configured portal. The portal checks its bootstrap secret, immutable Installation/repository/App identity, and signed request nonce before accepting distinct directional credentials into its private D1 store. The browser receives only pairing success. Run `feedbax doctor` afterward.

The Feedbax Installation ID and GitHub App installation ID are different. Multiple portals may use one App installation, each with a different Feedback Repository, private mappings, and directional credentials. One repository has one active writer binding. Pairing again after proving both sides rotates directional credentials; requests signed with the prior version stop working. Revoke a binding with an authenticated `/v1/revoke` request; never use a Participant session or submission API key as integration authority.

## Delivery and recovery

Webhook authentication covers the bounded raw body before JSON parsing. A D1 batch persists the App/delivery receipt and per-binding work before HTTP 202. Duplicate ingress cannot replace the original work. Uninstallation, suspension, and repository removal revoke access in that batch. A failed durability commit returns failure. After the commit, the service sends an opaque `{ workId }` signal to its delivery Queue. Once that commit succeeds, the service acknowledges HTTP 202 even if a Queue send fails. Dispatch is attempted independently for every affected binding; a failed send leaves its durable outbox checkpoint due for hourly recovery. Explicit revocation likewise returns `{ revoked: true }` after deactivation commits, even if its notification cannot be queued. Redelivering a webhook resumes the same receipt; hourly recovery also repairs the commit/send crash window. GitHub does not automatically redeliver failed webhooks. Only `issues`, `issue_comment`, `installation` and `installation_repositories` are handled by this Issues-only service. Other authenticated events receive HTTP 202 without creating receipts or delivery work; handled events keep durable receipt deduplication.

Raw webhook bodies are never persisted, queued, backed up, or logged: after authentication, durable work contains only binding/event references needed for authoritative reads. Payloads are never forwarded to portals. A push consumer processes the referenced job by primary key, using a fenced D1 lease and persisted retry time. An empty Queue does not invoke the consumer. Deliveries have at most five attempts with jittered backoff; early or duplicate signals cannot spend another attempt. The Queue allows ten redeliveries to accommodate lease/timing signals; exhausted signals remain recoverable from D1. A dead-letter Queue is intentionally unnecessary for recovery: D1 holds the authoritative work even after Queue retention or retries expire. Queue delays never exceed twelve hours. Longer waits are persisted in D1, acknowledged without another delayed retry, and re-signaled by recovery when due; a retry on an already-old signal is sent as a fresh message before acknowledging the old one. This keeps cumulative retry age away from Free's fixed 24-hour retention limit. Each consumer gives one due revocation priority before its referenced content job. Terminal failures put that binding generation into a 24-hour cooldown; revocation bypasses the cooldown. A successful delivery or authorized pairing clears the cooldown. Explicit library callers may still process up to ten due jobs. Portal receipts deduplicate logical work independently of HTTP nonces. Revocation denies fresh tokens and attachment reads even if an old delivery retries later.

Successful delivery updates its private checkpoint. Terminal failures remain visible through the authenticated, Installation-scoped `/v1/status` endpoint. Indexed maintenance selects diagnostics at their existing 30-day expiry threshold in batches of 100. A full batch queues a cleanup-only continuation immediately, so expired data drains without waiting for another hourly recovery pass. Raw-payload expiry remains seven days. Monitor cleanup lag and failed consumers; bounded processing does not relax these retention policies. Already-NULL payloads are skipped; stable mapping and receipt tombstones remain for replay safety. Deployment observability is disabled by default to avoid storing authorization callback URLs in request logs. If you add monitoring or external backups, enforce the contract's retention and secret exclusions in those systems too. Public `/health` reports liveness only.

The portal separately reconciles bounded mapped Posts and runs enabled Connected processing. GitHub content responses use `no-store`; known revocation cannot fall back to stale public HTML. The service cron runs hourly (`0 * * * *`) and only enqueues the constant `feedbax-github-maintenance-v1` signal; the Queue consumer performs recovery and cleanup under the consumer CPU allowance. Each pass considers the ten oldest due active bindings, coalesces polling with an existing pending reconciliation for the same generation, and re-signals up to 100 pending jobs whose dispatch checkpoint is due. Failed destinations in cooldown receive no new recovery jobs. Cleanup processes at most 100 rows per table per pass; continuation signals only run cleanup, without creating more polling jobs or repeating outbox dispatch. A missed event normally waits up to one hour for recovery for ten or fewer eligible bindings; larger sets, backlogs and outages can take longer. The portal's own reconciliation/Connected schedule remains independent. These intervals are recovery bounds to validate, not an instant-revocation promise. Validate Worker CPU, freshness, account permissions, and queue drain with your real deployment before claiming capacity or release acceptance.

## Upgrade an existing service

Keep the production deployment unchanged until this source and its rollout are reviewed. For rollout, create the dedicated Queue, copy both producer and consumer settings from `wrangler.example.jsonc` into the private configuration, and replace the old minute cron with the hourly cron. Delivery and scheduled maintenance require `INTEGRATION_DELIVERY_QUEUE`. Health and authenticated token/status routes remain usable while that binding is missing; committed webhook/revocation work stays durable until Queue configuration is restored. Schema migrations still must precede the source upgrade. Keep batch size/concurrency one and use an independent Queue for each service.

Pause the old cron before applying migration 0004, then deploy the updated Worker and its Queue configuration together. Migrations are additive except for replacing the job-selection index; old work and receipt identities remain intact. Hourly recovery dispatches existing pending work in batches of 100, so a large legacy backlog may need several passes. Retire obsolete acceptance bindings through authenticated revocation and verify current portal permissions/failures before rollout; do not delete replay-safety history as a quota fix. Reverting the source also requires restoring the previous scheduler/configuration; retain the added schema and credentials.

After deployment, test a submission, publication/status edit, Comment, removal and revocation; confirm Queue delivery, bounded retries and recovery after a lost signal. Check D1 row metrics, pending/failed counts, Queue quotas and cleanup lag over a full day. Local migrated-D1 tests are not production recovery or capacity evidence. Queue operations share the account quota: [batching/retries](https://developers.cloudflare.com/queues/configuration/batching-retries/) and [pricing](https://developers.cloudflare.com/queues/platform/pricing/).

## Free-plan capacity boundaries

D1 writes include changed index entries, so reducing reads shifts attention to the account's write budget. Queues operations and retries share the account allowance too: 100 recovered jobs per hour can consume roughly 7,200 operations per day for write/read/delete alone, before webhook traffic, retries and maintenance signals. Measure both row writes and Queue operations, not just reads. See [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) and [Queue retention limits](https://developers.cloudflare.com/queues/platform/limits/).

Batch/concurrency one intentionally bounds pressure on D1 and failing portals. A portal request has a ten-second timeout; a consumer may prioritize one other due revocation before its referenced job, so outages and bursts limit drain rate. Keep this conservative default until actual traffic justifies measured concurrency changes. Retire obsolete bindings rather than relying on periodic failed probes forever. No Free-plan throughput guarantee is made by these defaults.

## Verify the integration

Check `/health` for service liveness and `/v1/info` for the expected App identity. After pairing, run `feedbax doctor` in the portal, submit a disposable Post, publish only its approved JSON section through the native GitHub workflow, and verify removal of `feedbax:published` hides it again. Check both public and private repositories if you intend to support both. A public health response does not verify permissions, delivery backlog or portal readiness.

The [GitHub setup guide](../docs/content/docs/getting-started/github.mdx) covers the portal configuration, secret generation, database migrations and authorization sequence. The [native workflow guide](../docs/content/docs/guides/github-workflow.mdx) defines exact labels and public content. [Release acceptance](../../docs/version-0.2.2-acceptance.md) records tested behavior and remaining limits.
