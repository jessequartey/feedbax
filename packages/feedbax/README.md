# feedbax

The Deployer lifecycle CLI for a generated Feedbax portal. Version 0.2.2 extends the 0.2.1 CLI with GitHub binding setup and diagnostics.

```sh
pnpm exec feedbax doctor
pnpm exec feedbax deploy --dry-run
pnpm exec feedbax deploy
pnpm exec feedbax rotate-api-key
pnpm exec feedbax info
```

Use Node 24 LTS and pnpm 10. `doctor` validates typed configuration, selected-provider access, secrets, schema, enabled bindings, source checks and build. `deploy` previews the target and uploads only allowlisted secrets after confirmation. `--dry-run` performs no deployment or secret upload; `--yes` confirms an automated deployment. Keep the trusted submission key on your product server.

If `history: true` is enabled, doctor also checks its explicit D1 binding, observed-history tables and timer. Apply every included migration before deploying updated source. History adds no verified identity; see the [history guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/guides/progress-history.mdx).

For GitHub, apply the included migrations to the dedicated D1 database, then bootstrap and pair:

```sh
pnpm exec feedbax deploy --pairing-bootstrap
pnpm exec feedbax pair-github GITHUB_APP_INSTALLATION_ID
# Complete the printed GitHub authorization link, then:
pnpm exec feedbax doctor
```

Bootstrap intentionally leaves content unavailable until pairing. The portal uses its own directional credentials; it never receives the App key. The GitHub App installation ID differs from the stable Feedbax Installation ID. GitHub requires D1 even without Connected sign-in and disables Changelog.

Use `feedbax@0.2.2` for GitHub setup and source upgrades; 0.2.1 lacks these commands. Follow the [GitHub guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/getting-started/github.mdx). There are no new Team Member moderation commands. Source-only upgrade preview/apply/resume/rollback is included in 0.2.2. Read the [upgrade guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/guides/upgrading.mdx) before using the matching CLI: `upgrade --from 0.2.1`, then `--apply` after reviewing its private diff. `upgrade --status`, `--resume` and `--rollback` operate on the Installation-bound source journal. Configuration, dependencies, D1, credentials and deployment remain explicit separate stages. Full archive/isolated restore/provider migration and their acceptance remain pending.

[Configuration](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/operations/configuration.mdx) · [Authentication](https://github.com/jessequartey/feedbax/blob/main/docs/connected-profile.md) · [Release acceptance](https://github.com/jessequartey/feedbax/blob/main/docs/version-0.2.2-acceptance.md).

Documentation: [feedbax.dev/docs](https://feedbax.dev/docs). Core is Apache-2.0.

[Integration checklist](https://github.com/jessequartey/feedbax/blob/main/docs/integration-checklist.md) covers setup choices and end-to-end verification.
