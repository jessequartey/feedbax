# Testing

Feedbax uses small red-green slices at pre-agreed seams. Tests describe observable behavior and do not reach through a module's interface to assert on its implementation.

## Confirmed seams

- **Feedback module interface:** domain behavior and caller-visible failures
- **Notion adapter HTTP boundary:** requests to and responses from the external Notion API
- **Worker HTTP handlers:** authentication, validation, and serialized responses
- **Cloudflare Rate Limit binding:** limiter decisions at the external binding boundary
- **Turnstile Siteverify HTTP boundary:** verification requests and responses

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

Broad UI suites, automated multi-browser tests, and live-Notion CI are deferred. Before a release, perform a manual browser smoke test and a real read/write/trash cycle against a dedicated Notion test workspace.
