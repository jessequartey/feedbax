# Feedbax

Feedbax is becoming a lightweight, self-hostable customer-feedback portal that works with the tools product teams already use.

> Own your feedback. Keep your existing workflow.

## v0.1.0 preview

Feedbax is being rebuilt as a generator-led TanStack Start application with Effect contracts, conventional shadcn source ownership, and Notion as the launch connector and interaction store.

The first release will use Notion as its backend and provide:

- A public feedback board with search, filtering, and duplicate suggestions
- Anonymous or email-capture submission, best-effort voting, and comments
- A public roadmap and changelog
- Anonymous, email-only, and signed identity handoff modes
- Configurable branding and deployment to Cloudflare, Vercel, or Docker

Better Auth and SQL interaction stores are deferred until after v0.1.0. See [ROADMAP.md](ROADMAP.md) for the staged plan.

The intended installation path is:

```sh
npx create-feedbax@latest my-feedback
cd my-feedback
npx feedbax doctor
```

## Goals

- Make a useful portal deployable in minutes and inexpensive to operate.
- Avoid requiring another project-management backend.
- Keep the core framework, hosting platform, and connector agnostic.
- Provide honest documentation and predictable upgrades.

## Repository shape

```text
apps/        Product and documentation applications
packages/    Domain, contracts, services, identity, CLIs, and shared UI
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

Feedbax is MIT licensed. The v0.1.0 APIs remain preview interfaces.

## Dogfood board

Feedbax uses its own public portal for feature requests, roadmap updates, and
rollout issues: [Feedbax feedback](https://feedbax-feedback.jessefquartey.workers.dev).

- [Marketing and documentation](https://feedbax-docs.jessefquartey.workers.dev)
- [Duplicable Notion starter](https://brave-number-c98.notion.site/Feedbax-Notion-Starter-39dafe1596918155a94cc24a1a41a2a5)
