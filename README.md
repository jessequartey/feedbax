# Feedbax

An open-source feedback portal with Product Team workflow in Notion or GitHub. Collect ideas and bug reports, publish a roadmap, and discuss feedback. You own the application source and Cloudflare deployment.

**Released: 0.2.1**, with Notion and optional Connected participation. This branch implements **0.2.2**: GitHub, private My feedback, and further lifecycle work. GitHub has dedicated live acceptance portals; the complete release is still in progress. [Acceptance and remaining work](docs/version-0.2.2-acceptance.md).

[Documentation](https://feedbax-docs.jessefquartey.workers.dev/docs) · [Agent setup](docs/agent-setup.md) · [Existing-app authentication](docs/connected-profile.md) · [Feedback block](apps/docs/content/docs/integrations/feedback-block.mdx) · [Roadmap](ROADMAP.md)

## Create a portal

Use Node **24 LTS** and **pnpm 10**, a Cloudflare account, and the selected Content Provider. This repository pins Node 24.22.0 in `.nvmrc`.

For the released Notion path:

```sh
npx create-feedbax@0.2.1 my-feedback
cd my-feedback
pnpm dev
```

Have your product name, description, HTTPS portal URL, distinct Worker name, and Notion internal integration token ready. Share a parent page with the integration; enable read/insert Comments if needed. Guided setup previews schema changes, creates or validates storage, generates an application and private local secrets, installs dependencies, and checks readiness. It also offers deployment. Turnstile is optional and recommended for public intake.

For the upcoming GitHub path, follow [GitHub setup](apps/docs/content/docs/getting-started/github.mdx). It requires dedicated D1 and a paired GitHub App service, uses no Notion credentials, and disables Changelog. The guide distinguishes released commands from development-source setup.

| Choice                     | Content and workflow                                                                                               | Participant identity                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Notion                     | Feedback Data Source, native publication, Comments and optional Changelog                                          | Browser capabilities by default; optional Connected                           |
| GitHub, 0.2.2 development  | One Feedback Repository, explicit approved issue content, status/publication labels, portal Comments; dedicated D1 | Browser capabilities by default; optional Connected                           |
| Connected, either provider | Unique Votes, verified Comment attribution, Follows, private Notifications, optional email/images                  | Your existing product signs an Identity Handoff; D1 stores revocable sessions |

D1 alone never establishes verified identity. A Device Profile is unverified and is separate from draft authority. In 0.2.2, Connected also provides My feedback and cross-device ownership of new signed-in submissions; an old browser draft needs an explicit capability-backed claim.

**Public GitHub repositories expose issue titles and bodies immediately.** Portal moderation cannot make a public GitHub issue confidential. Select a private repository for private intake.

## Integrate your product

Start with the [integration checklist](docs/integration-checklist.md) for the setup path, credential locations and end-to-end verification.

The [feedback block guide](apps/docs/content/docs/integrations/feedback-block.mdx) covers the React/shadcn UI, server endpoint, validation, retries and abuse prevention:

```sh
pnpm dlx shadcn@latest add jessequartey/feedbax/feedbax-feedback#v0.2.1
```

Your product server calls [`POST /api/v1/posts`](apps/docs/content/docs/integrations/submission-api.mdx) with its trusted API key and a stable `Idempotency-Key`. Posts start New and unpublished. Store the plaintext key only in the product server; Feedbax keeps its hash. This service intake does not manufacture verified Participant ownership.

For verified Votes, Comments, Follows and ownership, separately implement [signed application authentication](docs/connected-profile.md). There is no Feedbax email login, and Participants need no GitHub account. Private images require R2; email is an independent opt-in capability.

## Verify and deploy

Run from the generated application:

```sh
pnpm exec feedbax doctor
pnpm build
pnpm deploy:dry-run
pnpm exec feedbax deploy
```

Diagnostics check the real selected provider, enabled features and bindings. Deployment previews the Worker and uploads allowlisted secrets. A build/dry-run is not a deployment; verify the live URL and a real submission afterward. GitHub initially uses `deploy --pairing-bootstrap`, then `pair-github`, GitHub authorization, and a full doctor check as described in its guide.

| File                | Purpose                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/feedbax.ts`    | Product settings, features and selected provider mappings; client builds receive an allowlisted projection |
| `.dev.vars`         | Ignored local credentials and signing secrets                                                              |
| `wrangler.jsonc`    | Worker, rate limits, and explicitly enabled D1/R2/Queue/email bindings                                     |
| `CONNECTED.md`      | Existing-application authentication and social capabilities                                                |
| `src/components/ui` | Owned shadcn primitives, Geist typography and theme                                                        |

[Configuration](apps/docs/content/docs/operations/configuration.mdx) · [Environment](apps/docs/content/docs/operations/environment.mdx) · [Deployment](apps/docs/content/docs/getting-started/deploy.mdx) · [CLI](apps/docs/content/docs/operations/cli.mdx) · [Security](SECURITY.md).

## Use a coding agent

```sh
npx create-feedbax@0.2.1 my-feedback --template-only
```

Template-only copies source without external provisioning or dependency installation. Follow [agent setup](docs/agent-setup.md), supply actual mappings/credentials, and verify the result. Test fixtures are not live configuration. Guided provisioning has no `--yes` flag.

## Work on this repository

```sh
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm dev:portal
# In another terminal:
pnpm dev:docs
```

Development source includes unreleased changes. Use dedicated provider test resources. Before submitting changes:

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

`packages:check` packs both CLIs and checks an independent Notion Installation plus a configured GitHub build and client/source-map privacy. The [UI maintenance guide](docs/shadcn-refresh-0.2.1.md) covers shared primitives and theme checks.

| Directory                                                    | Purpose                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `apps/portal`                                                | Portal, private Participant views and Worker handlers        |
| `apps/github-integration`                                    | Shared or self-hosted GitHub App service; App keys stay here |
| `apps/docs`                                                  | Documentation and tested integration examples                |
| `packages/feedback`, `packages/changelog`, `packages/config` | Domain modules and configuration                             |
| `packages/ui`                                                | Shared shadcn primitives and theme                           |
| `packages/create-feedbax`, `packages/feedbax`                | Creator, synchronized flat template and lifecycle CLI        |
| `registry`                                                   | Copied feedback block and server helper                      |

[Context](CONTEXT.md) · [Specification](SPEC.md) · [Testing](TESTING.md) · [Architecture decisions](docs/adr/) · [Contributing](CONTRIBUTING.md) · [Governance](GOVERNANCE.md).

Core is [Apache-2.0](LICENSE). New Team Member tools are deferred for 0.2.2; native provider workflow remains available. Upgrade/archive/restore/migration readiness is tracked in the acceptance record rather than presented as an available command before implementation.
