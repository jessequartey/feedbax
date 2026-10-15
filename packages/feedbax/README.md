# feedbax

The Deployer lifecycle CLI for a generated Feedbax portal. This 0.2.2 development source extends the released 0.2.1 CLI with GitHub binding setup and diagnostics.

```sh
pnpm exec feedbax doctor
pnpm exec feedbax deploy --dry-run
pnpm exec feedbax deploy
pnpm exec feedbax rotate-api-key
pnpm exec feedbax info
```

Use Node 24 LTS and pnpm 10. `doctor` validates typed configuration, selected-provider access, secrets, schema, enabled bindings, source checks and build. `deploy` previews the target and uploads only allowlisted secrets after confirmation. `--dry-run` performs no deployment or secret upload; `--yes` confirms an automated deployment. Keep the trusted submission key on your product server.

For GitHub, apply the included migrations to the dedicated D1 database, then bootstrap and pair:

```sh
pnpm exec feedbax deploy --pairing-bootstrap
pnpm exec feedbax pair-github GITHUB_APP_INSTALLATION_ID
# Complete the printed GitHub authorization link, then:
pnpm exec feedbax doctor
```

Bootstrap intentionally leaves content unavailable until pairing. The portal uses its own directional credentials; it never receives the App key. The GitHub App installation ID differs from the stable Feedbax Installation ID. GitHub requires D1 even without Connected sign-in and disables Changelog.

These GitHub commands are in development source until 0.2.2 is published. Follow the [GitHub guide](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/getting-started/github.mdx) for a built local CLI rather than assuming published 0.2.1 contains them. There are no new Team Member moderation commands. Upgrade/archive/restore/migration implementation and acceptance remain tracked separately.

[Configuration](https://github.com/jessequartey/feedbax/blob/main/apps/docs/content/docs/operations/configuration.mdx) · [Authentication](https://github.com/jessequartey/feedbax/blob/main/docs/connected-profile.md) · [Release acceptance](https://github.com/jessequartey/feedbax/blob/main/docs/version-0.2.2-acceptance.md).

Documentation: [feedbax.dev/docs](https://feedbax.dev/docs). Core is Apache-2.0.

[Integration checklist](https://github.com/jessequartey/feedbax/blob/main/docs/integration-checklist.md) covers setup choices and end-to-end verification.
