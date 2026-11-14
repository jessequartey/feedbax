# create-feedbax

Create a feedback portal on Cloudflare with a Notion team dashboard.

```sh
npx create-feedbax
pnpm create feedbax
bun create feedbax
```

Node 24.15+ is required. Follow the prompts; setup ends with a live URL. Run the
same command again to finish an interrupted setup. `--help` works offline.

For CI, set `NOTION_TOKEN`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Add `GITHUB_TOKEN` for the GitHub template. Tokens never go in command arguments.

```sh
npx create-feedbax my-feedback --yes --template notion-github \
  --notion-page <shared-page-id> --github-repo owner/repo --anonymous false
```

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

`cli:build` uses Vite+ Pack and W0's one `scripts/package-template.ts` allowlist.
W2's factories are bundled into `dist/providers.mjs`; prompts and setup accept
injected implementations of the frozen interfaces for testing. The Notion
schema and template guide have a single owner, W2. No provider credentials are
needed for ordinary tests.

The real Clack UI can be exercised safely with `node tests/cli/interactive-demo.ts`
from the repository root. Providers and subprocesses in that demo are fakes.
