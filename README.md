# Feedbax

Feedbax is becoming a lightweight, self-hostable customer-feedback portal that works with the tools product teams already use.

> Own your feedback. Keep your existing workflow.

## Rewrite status

Feedbax is being redesigned for v0.0.2. The previous prototype has been removed from this branch so the connector-based architecture can be built deliberately. This branch does not contain a runnable application yet.

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

Placeholder directories describe intent only; no framework has been scaffolded.

## Participate

- Read the [roadmap](ROADMAP.md).
- Open an [issue](https://github.com/jessequartey/feedbax/issues) to describe your workflow.
- Open an [early-adopter issue](https://github.com/jessequartey/feedbax/issues/new/choose) if you want to test the rewrite with your team.
- Review [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

Feedbax is MIT licensed. Its public interfaces are not stable yet.
