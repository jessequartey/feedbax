# Contributing

Feedbax is preparing for a v0.0.2 rewrite. Issues, workflow descriptions, and design feedback are welcome now; implementation contributions should align with an accepted issue or RFC.

## Before contributing

1. Search existing issues and discussions.
2. Open an issue describing the user problem, not only an implementation.
3. Wait for scope agreement before starting a large change.
4. Keep pull requests focused and update relevant documentation and tests.

## Expectations

- Claims must match implemented behavior.
- Core domain code must not depend on a connector or hosting provider.
- Connectors must declare capabilities and pass shared contract tests.
- Deployment targets must be verified in continuous integration.
- Secrets and personal customer data must never be committed.

Development setup will be documented when the monorepo scaffold lands.
