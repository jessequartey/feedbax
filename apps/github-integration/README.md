# Feedbax GitHub integration service

This Worker holds the GitHub App key for paired Feedbax portals. The official App and a team-owned App use this same open-source service. A portal receives short-lived access scoped to its verified Feedback Repository; it never receives the App key. Participant sign-in remains a separate Connected Profile capability.

## Deploy a service

Use Node 24 LTS and the repository's pnpm version. Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`; choose a distinct Worker, account, and D1 database. Configure `SERVICE_ORIGIN` and exact `TRUSTED_PORTAL_ORIGINS`. Apply `migrations/` to `FEEDBAX_APP_DB` with Wrangler. Do not point this binding at a portal's D1 database.

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

Webhook authentication covers the bounded raw body before JSON parsing. A D1 batch persists the App/delivery receipt and per-binding work before HTTP 202. Duplicate ingress cannot replace the original work. Uninstallation, suspension, and repository removal revoke access in that batch. A failed durability commit returns failure so GitHub can retry.

Raw webhook bodies are never persisted, queued, backed up, or logged: after authentication, durable work contains only binding/event references needed for authoritative reads. Payloads are never forwarded to portals. The minute cron leases at most one work item, retries delivery up to five times with jittered backoff, and periodically schedules current-state reads for the oldest destinations. Standard callers may explicitly request up to ten items. Portal receipts deduplicate logical work independently of HTTP nonces. Revocation denies fresh tokens and attachment reads even if an old delivery retries later.

Successful delivery updates its private checkpoint. Terminal failures remain visible through the authenticated, Installation-scoped `/v1/status` endpoint. Diagnostic codes expire within 30 days; stable mapping and receipt tombstones remain for replay safety. Deployment observability is disabled by default to avoid storing authorization callback URLs in request logs. If you add monitoring or external backups, enforce the contract's retention and secret exclusions in those systems too. Public `/health` reports liveness only.

The portal separately reconciles bounded mapped Posts and runs enabled Connected processing. GitHub content responses use `no-store`; known revocation cannot fall back to stale public HTML. A missed event is bounded by scheduled checks rather than an instant-revocation promise. Validate Worker CPU, freshness, account permissions, and queue drain with your real deployment before claiming capacity or release acceptance.
