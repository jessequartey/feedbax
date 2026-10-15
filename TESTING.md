# Testing

Feedbax uses small red-green slices at pre-agreed seams. Tests describe observable behavior and do not reach through a module's interface to assert on its implementation.

## Confirmed seams

- **Feedback module interface:** domain behavior and caller-visible failures
- **Notion adapter HTTP boundary:** requests to and responses from the external Notion API
- **Worker HTTP handlers:** authentication, validation, and serialized responses
- **Cloudflare Rate Limit binding:** limiter decisions at the external binding boundary
- **Turnstile Siteverify HTTP boundary:** verification requests and responses

## Approved 0.2.2 seams

The owner-approved 0.2.2 plan adds the following concrete external seams without replacing the Feedback module interface:

- **GitHub adapter HTTP boundary:** scoped issue/Comment/label requests and supported Project queries/mutations; explicit public projection, pagination, rate-limit responses and ambiguous/partial writes
- **Integration-service HTTP handlers:** bounded raw webhook signature verification, authenticated Portal Binding setup, directional portal/service authentication, replay rejection and cross-Installation isolation
- **Operational module interface with migrated D1/R2:** durable receipts, leases/checkpoints, bounded retries, payload expiry/reconciliation, visibility revocation and private attachment authorization; use real migrated storage through Miniflare rather than mocked SQL
- **Lifecycle CLI filesystem/provider boundary:** three-way generated-source upgrade preview, conflict preservation, archive validation, isolated restore, writer fencing and reversible cutover

Behavior cases are recorded in [the shared contract](docs/version-0.2.2-contract.md#acceptance-cases-and-evidence-ownership). Add tests one behavior at a time when implementing the corresponding ticket. Do not create tests for unavailable Team Member operation endpoints or report deferred capabilities as passing. Public/private GitHub, official/self-hosted service, account/Project support and migration acceptance require separate real evidence before release.

## Essential replacement-release tests

- A submission becomes a New, unpublished Post with an immutable slug.
- Public output contains only allowlisted fields.
- A Browser Capability edits an unpublished draft but not a published item.
- Trusted submission rejects an invalid API key and honors idempotency.
- Notion mapping is correct and a `429` respects `Retry-After`.
- The production Worker build starts and serves a smoke request.

Each behavior is implemented as one failing test followed by the minimum code needed to pass. Internal collaborators are not mocked. The Notion HTTP boundary may be replaced because it is a true external system.

## Pull-request checks

- Format and lint
- Type check
- Essential tests
- Production build
- `wrangler deploy --dry-run`

Broad UI suites, automated multi-browser tests, and live-Notion CI are deferred. Before a release, perform the browser, production Worker, capability opt-out, and real read/write/reply/resolve/trash cycle in [version 0.2.0 acceptance](docs/version-0.2.0-acceptance.md) against a dedicated Notion test workspace.
