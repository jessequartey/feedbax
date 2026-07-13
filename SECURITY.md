# Security Policy

Feedbax is pre-release and does not yet have a supported production version.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting and include affected versions, reproduction steps, impact, and suggested mitigation.

## Rewrite principles

- Connector credentials remain server-side.
- User identity is verified server-side; query parameters alone are never trusted.
- Signed identity tokens are short-lived and exchanged for secure sessions.
- Mutations are authenticated, validated, and rate-limited where appropriate.
- Public responses exclude private identities and internal fields.
- Handoff tokens and session cookies must never be logged. Public users contain only an opaque ID, display name, and optional avatar URL.
- Public mutation routes require a verified session, same-origin JSON requests, strict runtime schemas, bounded bodies, and per-action rate limits. Client-supplied identity and aggregate totals are ignored.
- Connector-only Notion voting stores only an HMAC-derived opaque voter key. `FEEDBAX_INTERACTION_HASH_KEY` must be a high-entropy server secret and must never be exposed to browsers or logs.
- Notion voting is best-effort: Feedbax serializes votes per feedback item within one process, but Notion provides no unique constraint, compare-and-swap, or cross-record transaction. Route vote mutations through one application instance. Multi-instance races or partial failures can temporarily create duplicate ledger rows or stale totals; strict distributed guarantees require an atomic interaction-store adapter.
- The built-in rate-limit store is process-local and is suitable only for development or a single Node/Docker process. Distributed production deployments must inject a shared durable `RateLimitStore`.
- Optional CAPTCHA is exposed through a server-side `CaptchaProvider`; it is disabled unless a provider is configured. CAPTCHA tokens and request bodies are never logged.
- Feedback and comments retain canonical Markdown. Rendering escapes raw HTML, allowlists emitted tags, and rejects unsafe link protocols.
- Comment authors are projected from verified sessions to opaque public IDs, names, optional avatars, and server-derived responder kinds. Authenticated email addresses are never persisted with comments, and email-like text in comment bodies is rejected.
- Rotate signing and session keys by adding a new key ID, making it active, retaining the previous key through the longest outstanding lifetime, and only then removing it.
