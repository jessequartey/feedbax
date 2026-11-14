# Contributing

Bug reports, pull requests and [community Notion templates](TEMPLATES.md) are welcome. The [README](README.md) is the user guide; keep setup instructions there.

## Setup

Use Node 24.15 or newer 24.x and npm. If you use nvm, run `nvm use` in the repo first.

```sh
git clone https://github.com/jessequartey/feedbax.git
cd feedbax
npm ci
npm ci --prefix packages/create-feedbax
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` with your own test values, then run `npm run dev`. The local portal opens at http://localhost:3000. Use a separate development OAuth app with its callback registered for localhost, or a test host integration; email/password login is disabled. Local posts sync to your real Notion database when `NOTION_TOKEN` is set; remove test rows afterwards.

The repo uses [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests and builds.

## Before you open a PR

```sh
npm run check
npm run typecheck
npm test
npm run build
npm run verify:build
node scripts/test-worker-entry.ts
node scripts/test-worker-sync.ts
```

Changed the CLI or generated template? Also run:

```sh
npm run cli:build
npm run test:package
```

The package test installs a generated app with npm, pnpm and bun. After changing `registry/` or `registry.json`, run `npm run registry:build` and commit the generated `public/r/` files. CI fails if they are stale.

## Guidelines

- Keep changes small and focused, with setup language a first-time user can follow.
- Files in `src/components/ui/` come from shadcn; use its CLI to update them.
- Never commit secrets. Use dummy credentials in tests and your own secrets in `.dev.vars`.
- Use `fetch` and Web Crypto; avoid new dependencies unless needed.

## Releasing

Maintainers only. Publish `create-feedbax`; there is no runtime `feedbax` package.

1. Verify the public Notion template loads in a signed-out browser, then sign in and verify its Duplicate icon opens the workspace picker. Its URL must match `NOTION_TEMPLATE_URL` in `packages/create-feedbax/src/links.ts` and the README link.
2. If rebuilding the template, set `NOTION_TOKEN` in your environment and run `npm run notion:template -- --page` followed by the URL of an empty page connected to that integration, optionally adding `--examples`. Use `--parent-page` instead to create a child page. Follow the printed steps for column order and publication.
3. On npm, configure the package's **Settings → Trusted Publisher → GitHub Actions**: owner `jessequartey`, repository `feedbax`, workflow `release.yml`.
4. Update `packages/create-feedbax/package.json` and [CHANGELOG.md](CHANGELOG.md), complete the checks above, and verify the deployed social/host login, sync and Free CPU gates. Local timings alone do not satisfy the production CPU gate.
5. Commit the release, then tag and push the version. For 0.3.0:

   ```sh
   git tag v0.3.0
   git push origin v0.3.0
   ```

The release workflow checks the version, builds, tests, publishes with provenance and creates the GitHub Release with the CLI tarball and checksums.
