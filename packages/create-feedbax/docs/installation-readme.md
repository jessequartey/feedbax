# Your Feedbax portal

This is an application you own. Product Teams manage Posts, statuses, Comments, and release notes in Notion; the portal runs on Cloudflare Workers.

[Feedbax on GitHub](https://github.com/jessequartey/feedbax) · [Setup and operations](https://feedbax-docs.jessefquartey.workers.dev/docs)

## Start locally

Use Node.js 22.14+ and pnpm 10. Guided setup already installs dependencies and configures the app:

```sh
pnpm dev
```

Open the local address printed by Vite. If this directory was created with `--template-only`, run `pnpm install` and finish configuration first; copied source is not yet connected to Notion.

## Configuration

| File                | Purpose                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/feedbax.ts`    | Public product settings, feature switches, Notion IDs/property mappings, and optional Connected settings       |
| `.dev.vars`         | Ignored local Notion token, API-key hash, participation signing secret, and enabled Turnstile/identity secrets |
| `wrangler.jsonc`    | Worker name, hostnames, rate-limit bindings, and optional dedicated D1 binding                                 |
| `src/components/ui` | Your copied shadcn primitives, utilities, and theme                                                            |
| `CONNECTED.md`      | Complete existing-application authentication setup and verification                                            |

The plaintext trusted API key printed during setup belongs on your product server. The portal stores its hash. Never expose either Notion credentials or signing secrets through browser configuration. Existing `src/feedbax.test-fixture.ts` is for tests only.

For template-only output, follow the [agent setup guide](https://github.com/jessequartey/feedbax/blob/main/docs/agent-setup.md) and supply real Notion mappings and secrets before diagnostics. For Connected, follow `CONNECTED.md`, implement the signed application endpoint, bind a dedicated D1 database, and apply the included migration.

## Check and deploy

```sh
pnpm exec feedbax doctor
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm deploy:dry-run
pnpm exec feedbax deploy
```

`doctor` checks actual configuration, permissions, and enabled bindings. `deploy:dry-run` checks the bundle. The final command publishes the configured Worker and uploads only supported secrets. Confirm the live URL and enabled flows afterward.

## Customize and integrate

Keep the included Geist font and shadcn theme tokens consistent. Run `pnpm lint` after UI changes; it checks theme colors, unknown Tailwind classes, and inspectable component classes. Update individual primitives instead of reapplying a full preset.

Use the [feedback block guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/integrations/feedback-block.mdx) to add feedback collection to your product. Its server helper uses a trusted submission key and new Posts remain unpublished until your Product Team moderates them in Notion. The portal’s standard footer links to Feedbax on GitHub.

Keep Comments and browser capabilities distinct from verified identity: Notion-only names/email are unverified, Votes are best-effort, and recent Comment editing uses short-lived browser capabilities. Connected adds signed identity, unique Votes, and durable attribution without moving content out of Notion.

See `AGENTS.md` for the short agent workflow.

## Connected social features

For following, in-app/email notifications, or image attachments, use the full Connected guide (CONNECTED.md in a generated app; docs/connected-profile.md in the source repository). Apply every included D1 migration, including the Follow baseline migration, configure the timer and dedicated processing queue for small mode, choose Cloudflare/Resend/custom email when required, and keep the R2 bucket private for images. Never use a Device Profile as verified email evidence. Run doctor and behavior checks; explicitly distinguish local tests from real sender delivery and production authentication acceptance.
