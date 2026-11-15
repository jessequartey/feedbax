# Contributing

Feedbax is small and maintained by one person. Review time is the bottleneck, so a focused PR with proof gets merged fast and a sprawling one gets closed. Read this page before you open anything.

## Where things go

| You have…                  | Put it in…                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| A bug                      | A [GitHub issue](https://github.com/jessequartey/feedbax/issues/new/choose) using the bug form     |
| An idea or feature request | A post on the [Feedbax demo portal](https://feedbax.juutech.africa). Votes decide what gets built. |
| A security problem         | A private report. See [SECURITY.md](.github/SECURITY.md). Never a public issue.                    |
| A Notion template          | A PR adding a row to [TEMPLATES.md](TEMPLATES.md)                                                  |

## The best way to help

- **Fix a bug you hit.** A small fix for an obvious bug needs no issue. Larger fixes link the issue.
- **Build a planned feature.** Posts on the [roadmap](https://feedbax.juutech.africa/roadmap) marked _Planned_ have a linked GitHub issue. Comment on the issue before you start so two people don't build the same thing.
- **Close things.** Point out duplicates, bugs that no longer reproduce (say which version), and dead PRs.
- **Test an open PR.** A comment saying what you tried and what you saw is worth more than a second PR.

Features that aren't on the roadmap: post the idea on the portal first. Unrequested features, redesigns and new dependencies are usually closed.

## Rules for a PR

These apply to everyone, drafts included. Following them doesn't guarantee a merge.

- **One problem per PR.** Include everything that fix needs (code, tests, README). Refactors and a second fix go in their own PRs.
- **Show that it works.** Say how you checked it and what you saw. "Tests pass" is not evidence on its own. UI changes need before/after screenshots in light and dark mode; add a short video for motion or timing. Upload them to the PR; don't commit them.
- **Run the checks** below and paste the result.
- **Keep it mergeable.** A PR that conflicts with `main` for 7 days with no activity is closed. You can reopen it after a rebase.
- **3 open PRs per person.** Get one merged or closed before opening a fourth.
- **No new setup steps.** Anything new is opt-in and off by default. First-time setup must not get longer.
- **Never commit secrets.** Use obviously fake credentials in tests and your own values in `.dev.vars`.

### AI-assisted contributions

AI-written code is welcome, from **any model or tool**. We judge the PR, not the model. Two conditions:

1. **Say what you used.** End the PR body with the model and harness, for example `Model: GPT-6.1 Sol (Codex)` or `Model: Claude Opus 5.5 (Claude Code)`. Agent commits carry a `Co-Authored-By:` trailer naming the model.
2. **You own it.** You've read the diff, you can explain every line, and you've run the checks. Unreviewed bulk output, invented APIs, or a PR that ignores [AGENTS.md](AGENTS.md) gets closed.

Point your agent at [AGENTS.md](AGENTS.md). It has the map, the rules and the checks.

## When a PR is closed

A PR that breaks a rule gets a comment naming the rule. Fix it and comment, or open a focused replacement that links the old one. Spam, automation floods, repeated pings and ban evasion get the account blocked.

## Setup

Use Node 24.15 or newer 24.x and npm. If you use nvm, run `nvm use` in the repo first.

```sh
git clone https://github.com/jessequartey/feedbax.git
cd feedbax
npm ci
npm ci --prefix packages/create-feedbax
cp .dev.vars.example .dev.vars
npm run dev   # http://localhost:3000
```

Fill `.dev.vars` with your own test values. Use a separate development OAuth app with its callback registered for localhost, or a test host integration; email/password login is disabled. Local posts sync to a real Notion database when `NOTION_TOKEN` is set, so use a test database and remove rows afterwards.

The repo uses [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests and builds.

## Checks

Run the fast checks for your changes before opening a PR:

```sh
npm run check
npm run typecheck
npm test -- --changed origin/main
```

While working on a single area, run only its test file or zone (`npm test -- tests/sync/runtime.test.ts` or `npm test -- tests/portal`). Keep tests focused on behavior that can break; extend existing cases instead of adding duplicate tests across layers.

- **Touched the CLI, `packages/` or `.template/`?** Also run `npm run cli:build && npm run test:package`.
- **Touched `registry/` or `registry.json`?** Run `npm run registry:build` and commit `public/r/`.
- **CI runs the full suite:** `npm test`, `npm run build && npm run verify:build`, and `node scripts/test-worker-{entry,auth,sync}.ts`.

## Code guidelines

- Files in `src/components/ui/` come from shadcn; use its CLI to update them.
- Use `fetch` and Web Crypto; avoid new dependencies unless they remove real code or risk.
- It must stay cheap on Cloudflare's Free plan. [AGENTS.md](AGENTS.md) has the full rules.

## Releasing

Maintainers only. Publish `create-feedbax` and `feedbax`.

1. Verify the public Notion template loads in a signed-out browser, then sign in and verify its Duplicate icon opens the workspace picker. Its URL must match `NOTION_TEMPLATE_URL` in `packages/create-feedbax/src/links.ts` and the README link.
2. If rebuilding the template, set `NOTION_TOKEN` in your environment and run `npm run notion:template -- --page` followed by the URL of an empty page connected to that integration, optionally adding `--examples`. Use `--parent-page` instead to create a child page. Follow the printed steps for column order and publication.
3. On npm, each package's **Settings → Trusted Publisher → GitHub Actions** is: owner `jessequartey`, repository `feedbax`, workflow `release.yml`.
4. Bump the versions in `package.json` and both `packages/*/package.json`, update [CHANGELOG.md](CHANGELOG.md), complete the checks above, and verify the deployed social/host login, uploads and sync. Record production CPU measurements and disclose any Free-limit overages in the changelog.
5. Merge the release PR, then tag the merge commit and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The release gate requires the tagged commit to be on `main` with successful `CI` and `Verify Core` results for that exact SHA; it waits up to 20 minutes for running CI.

The release workflow checks the version, builds, tests, publishes with provenance and creates the GitHub Release with the CLI tarball and checksums.
