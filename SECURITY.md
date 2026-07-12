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
- Rotate signing and session keys by adding a new key ID, making it active, retaining the previous key through the longest outstanding lifetime, and only then removing it.
