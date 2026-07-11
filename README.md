# Feedbax

Feedbax is becoming a lightweight, self-hostable customer-feedback portal that works with the tools product teams already use.

> Own your feedback. Keep your existing workflow.

## Development status

Feedbax is being redesigned for v0.0.2. The repository now contains the pnpm/Turborepo foundation, minimal TanStack Start application shells, typed package boundaries, and deployment build presets. Product behavior has not been implemented yet.

The first release will use Notion as its backend and provide:

- A public feedback board with search, filtering, and duplicate suggestions
- Authenticated submission, unique voting, and comments
- A public roadmap and changelog
- Anonymous browsing and signed identity handoff from an existing application
- Configurable branding and deployment to Cloudflare, Vercel, or Docker

Future connectors may include GitHub, Linear, Google Sheets, and local databases. See [ROADMAP.md](ROADMAP.md) for the staged plan.

## Goals

- Make a useful portal deployable in minutes and inexpensive to operate.
- Avoid requiring another project-management backend.
- Keep the core framework, hosting platform, and connector agnostic.
- Provide honest documentation and predictable upgrades.

## Planned repository shape

```text
apps/        Product and documentation applications
packages/    Domain, configuration, authentication, and shared UI
connectors/  Notion and future backend integrations
deploy/      Verified hosting presets
examples/    Integration and identity-handoff examples
```

## Development

Use Node 22.18 or newer and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm type-check
pnpm lint
pnpm test
```

Turborepo stores local task results in `.turbo`. Run `pnpm build` twice to observe cache hits, or `pnpm clean:cache` to clear the local task cache.

## Participate

- Read the [roadmap](ROADMAP.md).
- Open an [issue](https://github.com/jessequartey/feedbax/issues) to describe your workflow.
- Open an [early-adopter issue](https://github.com/jessequartey/feedbax/issues/new/choose) if you want to test the rewrite with your team.
- Review [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

Feedbax is MIT licensed. Its public interfaces are not stable yet.
