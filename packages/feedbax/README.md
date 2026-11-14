# feedbax

Manage a [Feedbax](https://github.com/jessequartey/feedbax) portal from inside the project that `npx create-feedbax` generated. Generated projects (0.4.0+) already depend on it.

```sh
npx feedbax admin                  # single-use admin sign-in link (15 minutes)
npx feedbax doctor                 # config, secrets, bindings, /api/health, Notion, GitHub
npx feedbax deploy                 # build, apply D1 migrations, deploy
npx feedbax@latest migrate         # upgrade the project's source (--dry-run to preview)
npx feedbax add <integration>      # github | github-login | google-login | host-login | email | webhooks
```

`migrate [version]` downloads the published `create-feedbax` templates for your project's version and the target, merges each upstream change into your files (3-way), and writes conflict markers where both sides changed. It never changes your `feedbax.config.ts` values, `wrangler.jsonc` resource IDs, names, routes or vars, `.dev.vars`, or Cloudflare secrets; required structural edits to those files are applied programmatically. It refuses a dirty Git tree unless `--force`, then applies new D1 migrations and deploys, each after a confirmation (`--yes` skips them). The version is recorded in `.feedbax/version`. 0.3.0 projects are detected from `package.json`; pass `--baseline <version>` if detection fails.

`add` reads secrets from masked prompts or environment variables (never flags), sets them with `wrangler secret bulk`, edits `feedbax.config.ts`, and offers to redeploy.

Node 24.15+ is required. Every command supports `--help`; `--version` works offline.
