# Manual Notion and Cloudflare Production Proof

This runbook proves the first real Feedbax Installation before its successful
steps are extracted into the creator and lifecycle CLI. It intentionally uses a
dedicated Notion page, test-only Feedback Items, and a `workers.dev` hostname.

## Preconditions

- Node.js and pnpm versions supported by the repository
- A dedicated Notion test page and an internal integration with Insert content
  access connected to that page
- A Cloudflare account with Workers enabled
- Permission to authorize Wrangler and create Worker secrets

Never paste `.dev.vars`, integration secrets, API keys, Browser Capabilities,
dashboard logs, or private Notion fields into this document or a screenshot.

## Run the guided proof

From the repository root:

```bash
./scripts/prove-manual-production.sh
```

The wizard creates the canonical Feedback Data Source only after confirmation,
writes local configuration to ignored `apps/portal/.dev.vars`, verifies the
repository, configures encrypted Worker secrets, and deploys to `workers.dev`.
It deliberately leaves Turnstile disabled so the production warning can be
observed. That Installation has weaker spam protection and is suitable only for
this controlled proof.

The manual Notion step can also be run independently:

```bash
NOTION_TOKEN='<secret>' pnpm manual:setup:notion '<parent-page-id>'
```

The command creates a new data source and is not idempotent. Confirm the target
page before running it and do not repeat it after a successful response.

## Live behavior checklist

Record pass/fail and a non-secret timestamp for each item:

- [ ] `/health` returns `200` with `{"status":"ok"}` and `Cache-Control: no-store`.
- [ ] The deployed Worker has no Turnstile secret and the production-warning
      runtime test passes. Live console capture is optional because Worker tail
      logs are ephemeral rather than durable proof evidence.
- [ ] An anonymous portal submission creates a New, unpublished Feedback Item.
- [ ] The same browser can edit its title, description, type, optional name, and
      optional email while the item remains New and unpublished.
- [ ] A second eligible draft can be withdrawn and its Notion page is trashed.
- [ ] Publishing or moving the first item beyond New prevents further browser
      draft edits.
- [ ] A Team Member can moderate and publish the first item in Notion.
- [ ] The published item appears on `/`, its detail route, the relevant Type and
      Status filters, and `/roadmap` when its status is Planned, In Progress, or
      Shipped.
- [ ] Public HTML and responses contain no submitter contact fields, Source,
      External ID, Edit Token Hash, unknown properties, or Notion page body.
- [ ] A live Feedbax write exercises invalidation and the Worker cache-purge
      boundary integration test passes. A live purge receipt is not required:
      Cloudflare's Cache API returns it only inside the Worker, and published
      Feedback Items are intentionally not writable through Feedbax.
- [ ] A direct Notion edit appears within the accepted two-minute freshness
      window.
- [ ] Temporarily replacing the deployed data-source ID produces a safe public
      failure without exposing configuration names or secrets; the original
      secret is restored immediately afterward.

Exercise that deployed failure path without printing the valid value:

```bash
printf '%s' 'invalid-manual-proof-data-source' | \
  pnpm --dir apps/portal exec wrangler secret put NOTION_FEEDBACK_DATA_SOURCE_ID
curl --silent --show-error "$FEEDBAX_WORKERS_URL/"
grep '^NOTION_FEEDBACK_DATA_SOURCE_ID=' apps/portal/.dev.vars | cut -d= -f2- | \
  pnpm --dir apps/portal exec wrangler secret put NOTION_FEEDBACK_DATA_SOURCE_ID
curl --fail-with-body --silent --show-error "$FEEDBAX_WORKERS_URL/"
```

The first response must show only the safe public failure state. Always run the
restoration pipeline even if that assertion fails.

### Trusted submission and idempotency

Load the ignored smoke key without displaying it, submit twice with the same
idempotency key, and compare the returned Feedback Item identity:

```bash
set -a
. apps/portal/.dev.vars
set +a
IDEMPOTENCY_KEY="manual-proof-$(date +%s)"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $FEEDBAX_SMOKE_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"title":"Manual trusted proof","description":"Test-only trusted submission.","type":"General Feedback"}' \
  "$FEEDBAX_WORKERS_URL/api/v1/feedback"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $FEEDBAX_SMOKE_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"title":"Manual trusted proof","description":"Test-only trusted submission.","type":"General Feedback"}' \
  "$FEEDBAX_WORKERS_URL/api/v1/feedback"
unset FEEDBAX_SMOKE_API_KEY IDEMPOTENCY_KEY
```

Do not save terminal output if it contains private diagnostic data. Record only
that both successful responses returned the same public Feedback Item ID.

## Browser acceptance pass

- Desktop: navigate through list, filters, detail, submission, draft editing,
  withdrawal, and roadmap.
- Mobile width: repeat the critical submission and navigation path with no
  clipped controls or horizontal scrolling.
- Keyboard only: reach every interactive control in a sensible order; confirm
  visible focus, labels, validation errors, and submission results.

## Custom-domain procedure (not performed in this ticket)

In Cloudflare, open **Workers & Pages**, select the deployed `feedbax` Worker,
open **Settings → Domains & Routes**, choose **Add → Custom Domain**, enter a
hostname in a Cloudflare-managed zone, and confirm. Wait for the certificate to
be active, then repeat the health and public-route smoke checks on that hostname.
Do not add a route or change DNS during this proof.

## Evidence record

Record only these non-secret facts in the ticket or pull request:

- Git commit tested
- UTC test window
- Notion database and data-source IDs in redacted form (last six characters)
- `workers.dev` hostname
- Local verification commands and pass/fail result
- Each live behavior and browser checklist result
- Confirmation that Turnstile was disabled and its production-warning runtime
  test passed
- Confirmation that no secret-bearing file is tracked

## Cleanup and recovery

After the proof, remove the plaintext smoke key (the wizard offers this exact
operation) and verify local secret files remain ignored:

```bash
tmp=$(mktemp)
grep -v '^FEEDBAX_SMOKE_API_KEY=' apps/portal/.dev.vars > "$tmp" || true
mv "$tmp" apps/portal/.dev.vars
chmod 600 apps/portal/.dev.vars
git check-ignore apps/portal/.dev.vars
git status --short
```

Delete the test Feedback Items from the dedicated Notion database. When the
Installation is no longer required, delete the test Worker after confirming its
resolved name, then remove local secrets:

```bash
pnpm --dir apps/portal exec wrangler whoami
pnpm --dir apps/portal exec wrangler delete feedbax
rm apps/portal/.dev.vars
```

In Notion, open **Settings → Connections**, select the dedicated internal
integration, revoke its token, disconnect it from the test parent page, and only
then delete the dedicated test database/page if it is no longer useful.

If setup fails after Notion creation, do not rerun it blindly. Inspect the parent
page and query the created data source to recover its stable property IDs without
printing the token:

```bash
read -r DATA_SOURCE_ID
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H 'Notion-Version: 2026-03-11' \
  "https://api.notion.com/v1/data_sources/$DATA_SOURCE_ID" | \
  jq '{data_source_id: .id, property_ids: (.properties | map_values(.id))}'
```

Write the recovered IDs to the matching ignored `.dev.vars` keys documented by
`apps/portal/src/feedback-runtime.ts`, then rerun local verification—not the
creating setup command. If deployment fails, keep the Notion data source and run
`pnpm deploy:dry-run` followed by `pnpm --filter @feedbax/portal run deploy`; no
second Notion mutation is needed.
