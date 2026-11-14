# create-feedbax

Create a feedback portal on Cloudflare with a Notion team dashboard.

```sh
npx create-feedbax
pnpm create feedbax
bun create feedbax
```

Node 24.15+ is required. Follow the prompts and choose GitHub (recommended), Google or your app's existing login. Email/password login is disabled. Run the
same command again to finish an interrupted setup. `--help` works offline.

For CI, set `NOTION_TOKEN`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Add `GITHUB_TOKEN` only for Notion + GitHub issue sync. GitHub login separately
requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; Google login requires
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. No credentials go in flags.

After Cloudflare resolves the production origin, setup prints the exact OAuth App
homepage and callback fields before creating D1, R2 or Queue resources. Register
that callback with your provider. `--yes` needs an already registered app and the
selected complete credential pair from the environment or private `.dev.vars`.
Google may require consent-screen configuration, test users and publishing or
verification depending on your audience. A configured pair does not prove login.

`--login host --app-url https://your-app.example` deploys with host integration
pending. Follow the main README's same-origin authenticated token endpoint and
FeedbaxLink instructions; keep the shared host key server-side. Setup preserves
existing signing keys and OAuth pairs. On resume it infers GitHub, then Google,
then host from saved credentials/app URL; conflicting app URLs require an explicit
config edit. Half-pairs are rejected rather than combined across sources.

```sh
npx create-feedbax my-feedback --yes --template notion-github \
  --notion-page <shared-page-id> --github-repo owner/repo --login github --anonymous false
```

Setup checks health, public login capabilities and social authorization-start
wiring. Complete a real sign-in and first feedback write before considering login
verified. Host setup always reports the external integration as pending.

Use a separate development OAuth App for localhost. Replace local credentials in
`.dev.vars` (mode 0600, gitignored), retain the production callback registration,
and update production secrets explicitly. Do not deploy localhost credentials over
production.

See the [Feedbax README](https://github.com/jessequartey/feedbax) for embedding,
theming, social login and the team workflow.

## Repository development

The root is not an npm workspace. Install this package's exact dependencies too:

```sh
npm ci
npm ci --prefix packages/create-feedbax
npm run cli:build
npm run test:package
```

`cli:build` uses Vite+ Pack and the one `scripts/package-template.ts` allowlist.
The real Notion and GitHub clients from `src/integrations` are bundled into
`dist/providers.mjs`; prompts and setup accept injected implementations of the
same interfaces for testing. The Notion schema and template guide live only in
`src/integrations`. No provider credentials are needed for ordinary tests.

The real Clack UI can be exercised safely with `node tests/cli/interactive-demo.ts`
from the repository root. Providers and subprocesses in that demo are fakes.
