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
