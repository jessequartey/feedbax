# create-feedbax

Create an owned Feedbax portal for Cloudflare Workers. Version 0.2.2 supports Notion or Issues-only GitHub content with independent optional Connected participation.

```sh
npx create-feedbax@0.2.2 my-feedback
cd my-feedback
pnpm dev
```

Use Node 24 LTS and pnpm 10 for this source version. Guided setup collects product details, the selected provider, optional features and Turnstile protection. It previews provider changes, copies a flat application, installs dependencies, checks readiness and offers deployment. Provider mappings live in `src/feedbax.ts`; credentials stay in ignored `.dev.vars` and Cloudflare secrets.

Notion setup needs an internal integration and shared parent page. GitHub setup needs explicitly provisioned D1, a Feedback Repository and a paired App service; it uses no Notion token and disables Changelog. A public repository exposes issues immediately even before portal publication. Connected identity remains a separate existing-application integration for either provider.

`--template-only` copies source without service calls or dependency installation. It does not provision or connect storage. Run `create-feedbax --help` for options; guided provisioning has no `--yes` flag.

Observed History is an explicit `history: true` configuration with D1 and a timer, independent of Connected identity. It records public changes after a baseline rather than reconstructing private provider history; see the [history guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/guides/progress-history.mdx).

[GitHub setup](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/getting-started/github.mdx) · [Agent setup](https://github.com/jessequartey/feedbax/blob/main/docs/agent-setup.md) · [Authentication](https://github.com/jessequartey/feedbax/blob/main/docs/connected-profile.md) · [Release acceptance](https://github.com/jessequartey/feedbax/blob/main/docs/version-0.2.2-acceptance.md).

Documentation: [feedbax.dev/docs](https://feedbax.dev/docs). Core is Apache-2.0.

[Integration checklist](https://github.com/jessequartey/feedbax/blob/main/docs/integration-checklist.md) covers product-server intake, credential locations and production verification.

Existing customized Installations use the separate lifecycle CLI [source upgrade flow](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/guides/upgrading.mdx); do not generate a fresh template over an existing app. Full data restore/migration acceptance remains pending.
