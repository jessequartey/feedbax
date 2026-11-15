# feedbax

Manage a [Feedbax](https://github.com/jessequartey/feedbax) portal from inside the project that `npx create-feedbax` generated. Generated projects (0.3.1+) already depend on it.

```sh
npx feedbax admin                  # single-use admin sign-in link (15 minutes)
npx feedbax doctor                 # config, secrets, bindings, /api/health, Notion, GitHub
npx feedbax deploy                 # build, apply D1 migrations, deploy
npx feedbax@latest migrate         # upgrade the project's source (--dry-run to preview)
npx feedbax add <integration>      # github | github-login | google-login | host-login | email | webhooks
```

`migrate [version]` downloads the published `create-feedbax` templates for your project's version and the target, merges each upstream change into your files (3-way), and writes conflict markers where both sides changed. It never changes your `feedbax.config.ts` values, `wrangler.jsonc` resource IDs, names, routes or vars, `.dev.vars`, or Cloudflare secrets; required structural edits to those files are applied programmatically. It refuses a dirty Git tree unless `--force`, then applies new D1 migrations and deploys, each after a confirmation (`--yes` skips them). Rerun the same command after an interruption to resume from `.feedbax/` progress; `--dry-run` lists the remaining steps. Resolve source conflicts and rerun `migrate` to continue. The version is recorded in `.feedbax/version` only after migrations and deployment succeed. 0.3.0 projects are detected from `package.json`; pass `--baseline <version>` if detection fails.

`add` reads secrets from masked prompts or environment variables (never flags), validates their format and provider access before writing anything, edits `feedbax.config.ts`, sets secrets with `wrangler secret bulk`, and offers to redeploy. Failures list changed files and secret names with a recovery command.

Node 24.15+ is required. Every command supports `--help`; `--version` works offline.
