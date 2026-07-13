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

## Development setup

Install Node 22.18 or newer, enable Corepack, and run `pnpm install --frozen-lockfile`.

Before opening a pull request, run the same quality and compatibility checks used by continuous integration from the repository root:

```sh
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm --filter @feedbax/deploy-cloudflare build
pnpm --filter @feedbax/deploy-vercel build
docker build -f deploy/docker/Dockerfile -t feedbax:local .
```

Use `pnpm format` to apply the repository's formatting rules.

## Required checks

The `main` branch should require these GitHub Actions status checks before merging:

- `Quality / Dependencies`
- `Quality / Formatting`
- `Quality / Linting`
- `Quality / Type-checking`
- `Quality / Unit tests`
- `Quality / Build`
- `Deployment / Cloudflare`
- `Deployment / Vercel`
- `Deployment / Docker`

Configure these exact names as required checks in the GitHub branch protection rules for `main` after the workflow has run at least once.

The deployment checks are credential-free smoke builds: they verify that each target can produce a deployable artifact or image, but they do not deploy it. The live runtime smoke suite requires deployed URLs and provider or Notion secrets, so it is intentionally excluded from pull request workflows. See [`deploy/README.md`](deploy/README.md) for the live verification procedure and current evidence.
