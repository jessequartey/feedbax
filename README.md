# Feedbax

An open-source feedback portal with your Product Team’s workflow in Notion. Collect ideas and bug reports, publish a roadmap, discuss feedback, and share release notes. Deploy it to your own Cloudflare Worker and keep the source.

[Get started](https://feedbax-docs.jessefquartey.workers.dev/docs) · [Set up with an agent](docs/agent-setup.md) · [Authentication](docs/connected-profile.md) · [Feedback block](apps/docs/content/docs/integrations/feedback-block.mdx) · [Roadmap](ROADMAP.md)

## Create your portal

You need Node.js **22.14+**, **pnpm 10**, a Notion workspace, and a Cloudflare account.

```sh
npx create-feedbax@0.2.0 my-feedback
cd my-feedback
pnpm dev
```

Guided setup connects a Notion integration to a page you choose, creates or validates the Feedback and Changelog sources, copies an application you own, installs dependencies, and checks configuration. Open the local address printed by the development server. The setup flow also offers deployment.

Before setup, have your product name, public description, intended portal URL, distinct Worker name, and Notion integration token ready. Share the target Notion page with the integration. If Comments are enabled, grant both read-comment and insert-comment access. Turnstile is optional; production setup recommends it.

From the generated project:

```sh
pnpm exec feedbax doctor
pnpm build
pnpm deploy:dry-run
pnpm exec feedbax deploy
```

`doctor` checks real configuration, permissions, and bindings. The final command deploys the selected Worker; a build or dry run alone does not publish it. Keep the plaintext trusted submission key printed during setup in your product server’s secret store.

## What you get

- Moderated feedback: submissions start **New and unpublished**. Your Product Team publishes and manages them in Notion.
- A public Feedback feed with Top/New sorting, search, and status/type filters.
- A roadmap and Notion-backed changelog.
- Optional Votes and native Notion Comment threads; resolved threads disappear from the portal.
- A copied shadcn feedback block and server helper for adding feedback collection to your existing product.
- Typed configuration, a diagnostic/deployment CLI, and a flat React/TanStack Start application you can customize.

Notion remains the source of truth for Posts, statuses, moderation, Comments, and release content. Cloudflare hosts the application. You own both accounts and the copied code.

## Choose a participation profile

| Profile                              | Identity and participation                                                                                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Notion-only — available in 0.2.0** | No operational database. Display names and email are unverified; email stays private. Votes are browser-remembered and best-effort, with no reliable one-person-one-vote guarantee. Recent Comment changes use a 15-minute browser capability. |
| **Connected — prepared for 0.2.1**   | Your existing app signs an identity handoff. A dedicated D1 database stores revocable sessions, unique Votes, and durable verified Comment attribution. Your app remains the sign-in provider.                                                 |

**Published version: 0.2.0.** This branch prepares 0.2.1; Connected is not included in the published 0.2.0 command above. Its release still requires a production sign-in acceptance run with a real product application. See [0.2.1 acceptance](docs/version-0.2.1-acceptance.md).

The [authentication guide](docs/connected-profile.md) covers the application endpoint, signing protocol, secrets, D1 migration, sessions, logout, verification, and troubleshooting. Adoption and custom domains are separate owner-led work.

## Add feedback to your product

Install the reviewed block from the released GitHub tag:

```sh
pnpm dlx shadcn@latest add jessequartey/feedbax/feedbax-feedback#v0.2.0
```

The [complete feedback block guide](apps/docs/content/docs/integrations/feedback-block.mdx) covers React/Tailwind/Base UI requirements, copied files, server credentials, authenticated submission, retries, moderation, and verification. The trusted submission key belongs on your product server, never in a browser bundle. Installing the block and setting up Connected sign-in are independent integrations.

## Setup with a coding agent

The generator supports copying source without prompts or external service requests:

```sh
npx create-feedbax@0.2.0 my-feedback --template-only
```

This creates source, **not a configured installation**. Follow [the agent setup guide](docs/agent-setup.md) to supply real Notion mappings and local secrets, run diagnostics, and verify the result. Guided setup remains the quickest way to provision a new Notion schema. There is no `--yes` option for guided provisioning.

A useful starting request for your agent is:

> Set up Feedbax for my product. Read the repository’s agent setup guide, use the published release unless I request development source, collect the required product and Notion inputs, then verify the portal locally and report which checks passed. Distinguish local readiness from deployment.

## Configuration and operations

- Public settings, feature switches, and stable Notion property IDs: generated `src/feedbax.ts`.
- Secrets: ignored `.dev.vars` locally and encrypted Worker secrets in production.
- Infrastructure: `wrangler.jsonc`; Connected additionally uses a dedicated `FEEDBAX_DB` binding and the included migration.
- Branding and shadcn components: the copied source; the standard portal includes a GitHub-linked Feedbax footer.
- Diagnostics: `pnpm exec feedbax doctor`. Trusted key rotation: `pnpm exec feedbax rotate-api-key`.

[Environment setup](apps/docs/content/docs/operations/environment.mdx) · [Deployment](apps/docs/content/docs/getting-started/deploy.mdx) · [Participation guarantees](docs/notion-native-participation.md) · [Security policy](SECURITY.md)

Version 0.2.0 replaces the 0.1 architecture and requires a fresh installation. It does not import or mutate a legacy portal. Keep legacy content until you decide what to retain.

## Work on this repository

```sh
pnpm install --frozen-lockfile
pnpm dev:portal
# Or, in another terminal:
pnpm dev:docs
```

These commands run the development source, including unreleased changes. The portal prints its local address (normally port 3001; another available port is used if occupied). Use a dedicated Notion test workspace and the configuration/environment guides above; a template-only checkout cannot read Notion until configured.

Before submitting changes:

```sh
pnpm template:sync
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm template:check
pnpm security:check
pnpm packages:check
pnpm deploy:dry-run
pnpm deploy:docs:dry-run
```

The shadcn lint checks theme colors, known Tailwind classes, and inspectable component classes. Refresh individual shared components with `pnpm dlx shadcn@latest add <component> -c apps/portal`; do not reapply a full preset. See [the UI maintenance guide](docs/shadcn-refresh-0.2.1.md).

| Directory                                                    | Purpose                                            |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `apps/portal`                                                | Public portal and Worker handlers                  |
| `apps/docs`                                                  | Documentation site and tested integration examples |
| `packages/feedback`, `packages/changelog`, `packages/config` | Domain behavior and typed configuration            |
| `packages/ui`                                                | Shared shadcn primitives and theme                 |
| `packages/create-feedbax`, `packages/feedbax`                | Generator, owned-app template, and lifecycle CLI   |
| `registry`                                                   | Copied feedback block and server helper            |

[Context](CONTEXT.md) · [Specification](SPEC.md) · [Testing](TESTING.md) · [Architecture decisions](docs/adr/) · [Contributing](CONTRIBUTING.md) · [Governance](GOVERNANCE.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## License

[Apache-2.0](LICENSE).
