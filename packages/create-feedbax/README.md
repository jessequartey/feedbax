# create-feedbax

Create a feedback portal on Cloudflare with a Notion team dashboard.

```sh
npx create-feedbax
pnpm create feedbax
bun create feedbax
```

Node 24.15+ is required. Follow the prompts: a project name, your Notion secret and
Cloudflare login. Setup uses the Notion template with anonymous feedback on and no
sign-in provider, so it needs nothing else. Run the same command again to finish an
interrupted setup. `--help` works offline.

For CI or an agent, set `NOTION_TOKEN`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
and pass `--yes`. Nothing else is required. No credentials go in flags.

```sh
NOTION_TOKEN=… CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npx create-feedbax my-feedback --yes
```

Add GitHub issue sync, GitHub, Google or host login, email and webhooks afterwards
with `npx feedbax@latest add <github|github-login|google-login|host-login|email|webhooks>`
from the project folder. See the [Feedbax README](https://github.com/jessequartey/feedbax#add-ons).

## Shortcuts

`--template notion-github --github-repo owner/repo` (with `GITHUB_TOKEN`) enables issue
sync during setup. `--login github|google` (with `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
or `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) or `--login host --app-url https://your-app.example`
configures sign-in during setup. `--anonymous false` turns anonymous feedback off, which
needs a sign-in provider. `--private --app-url https://your-app.example` makes a customers-only
board: every page, image and feed needs a signed-in account from that app (host login). With `--login`, setup prints the exact OAuth callback before
creating resources, and `--yes` needs the credentials in the environment or private `.dev.vars`.
A configured pair does not prove login: complete a real sign-in and first feedback write.
Host setup always reports the external integration as pending. Half-pairs are rejected
rather than combined across sources, and conflicting app URLs require an explicit config edit.

```sh
npx create-feedbax my-feedback --yes --template notion-github \
  --notion-page <shared-page-id> --github-repo owner/repo --login github --anonymous false
```

Use a separate development OAuth App for localhost. Replace local credentials in
`.dev.vars` (mode 0600, gitignored), retain the production callback registration,
and update production secrets explicitly. Do not deploy localhost credentials over
production.

See the [Feedbax README](https://github.com/jessequartey/feedbax) for embedding,
theming and the team workflow.

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
