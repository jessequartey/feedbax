# Your Feedbax portal

This is an application you own. Product Teams manage Posts, statuses, Comments, and release notes in the selected Notion or GitHub Content Provider; the portal runs on Cloudflare Workers.

[Feedbax on GitHub](https://github.com/jessequartey/feedbax) · [Setup and operations](https://feedbax-docs.jessefquartey.workers.dev/docs)

## Start locally

Use Node.js 24.15+ (Node 24 LTS) and pnpm 10. The included `.nvmrc` pins the tested version; with nvm installed, run `nvm install` and `nvm use` before working on the Installation. Guided setup already installs dependencies and configures the app:

```sh
pnpm dev
```

Open the local address printed by Vite. If this directory was created with `--template-only`, run `pnpm install` and finish configuration first; copied source still requires provider configuration.

## Configuration

| File                | Purpose                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/feedbax.ts`    | Product settings, feature switches, selected provider mapping, and optional Connected settings           |
| `.dev.vars`         | Ignored local provider/pairing credentials, API-key hash, and enabled signing/Turnstile/identity secrets |
| `wrangler.jsonc`    | Worker name, hostnames, rate-limit bindings, and optional dedicated D1 binding                           |
| `src/components/ui` | Your copied shadcn primitives, utilities, and theme                                                      |
| `CONNECTED.md`      | Complete existing-application authentication setup and verification                                      |

The plaintext trusted API key printed during setup belongs on your product server. The portal stores its hash. Never expose either Notion credentials or signing secrets through browser configuration. Existing `src/feedbax.test-fixture.ts` is for tests only.

For template-only output, follow the [agent setup guide](https://github.com/jessequartey/feedbax/blob/main/docs/agent-setup.md) and supply real provider mappings and secrets before diagnostics. For Connected, follow `CONNECTED.md`, implement the signed application endpoint, bind a dedicated D1 database, and apply the included migration.

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

Use the [feedback block guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/integrations/feedback-block.mdx) to add feedback collection to your product. Its server helper uses a trusted submission key and new Posts remain unpublished until your Product Team publishes them through its selected provider. The portal’s standard footer links to Feedbax on GitHub.

Keep Comments and browser capabilities distinct from verified identity: Notion-only names/email are unverified, Votes are best-effort, and recent Comment editing uses short-lived browser capabilities. Connected adds signed identity, unique Votes, and durable attribution without moving content out of Notion.

See `AGENTS.md` for the short agent workflow.

## Connected social features

For following, in-app/email notifications, or image attachments, use the full Connected guide (CONNECTED.md in a generated app; docs/connected-profile.md in the source repository). Apply every included D1 migration, including the Follow baseline migration, configure the timer and dedicated processing queue for small mode, choose Cloudflare/Resend/custom email when required, and keep the R2 bucket private for images. Never use a Device Profile as verified email evidence. Run doctor and behavior checks; explicitly distinguish local tests from real sender delivery and production authentication acceptance.

## GitHub setup and publication

GitHub requires a dedicated D1 database even without Participant sign-in. It uses no Notion token, and Changelog must be disabled. A GitHub App service holds the App key; this portal stores only its own directional binding credentials. Setup must use the public-fetch compatibility flag for Worker-to-Worker calls, or an explicitly configured Service Binding. Never copy an App private key into the portal.

Apply the included D1 migrations, deploy once with `feedbax deploy --pairing-bootstrap`, run `feedbax pair-github GITHUB_APP_INSTALLATION_ID`, and complete the printed GitHub authorization flow. Run `feedbax doctor` after pairing. Bootstrap deployment intentionally leaves feedback unavailable until authorization finishes.

Native GitHub workflow uses exactly one label: `feedbax:new`, `feedbax:reviewing`, `feedbax:planned`, `feedbax:in-progress`, `feedbax:shipped`, or `feedbax:closed`. Add `feedbax:published` independently to display a Post in the portal. Issue closure alone does not change its Feedbax status. Missing/conflicting status labels block draft changes until repaired.

The issue body contains a versioned JSON section between `<!-- feedbax:public:v1 -->` and `<!-- /feedbax:public -->`. Edit its title, description, type and optional Team Response/release-notes URL to change approved portal content. Keep its immutable slug. Notes outside this section and ordinary engineering comments are never portal content. Portal Comments are separately marked App-created records with private attribution mappings.

**A public repository exposes issue titles and bodies on GitHub immediately, including Posts awaiting portal moderation.** Use a private Feedback Repository for confidential intake. Portal moderation cannot make an existing public GitHub issue private.

Connected identity remains independent: only verified application sessions get cross-device ownership, My feedback, unique Votes and Follows. D1 alone does not establish identity. Browser drafts can be explicitly linked only while New/unpublished and while the browser still possesses their capability.
