# Dependency refresh for 0.2.2

The 2026-10-15 refresh moves both apps and the generated Installation from TanStack Start 1.168.48 to 1.169.2. [TanStack's migration guide](https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate) identifies 1.169 as the first stable release, marketed as Start 1.0. Its package numbering continues the existing sequence.

Both apps already use Vite 8, `.validator()`, and the supported server entry. They do not use the removed Start session API or Nitro plugin. The portal wraps requests with `createServerEntry`; the docs app delegates framework requests to the built-in server entry. Existing handlers return explicit Responses for expected API failures. These patterns are retained through the stable upgrade.

The refresh also updates Router and its CLI/devtools, Query, React/React DOM, Vite and its React plugin, Cloudflare's Vite plugin/Workers types/Wrangler, Better Auth and its adapter, Fumadocs, Drizzle, Zod, dotenv, icons, styling helpers, Testing Library, Vitest, and repository lint/build/format tools. Direct dependency versions and the workspace lockfile record the exact selection. Generated Installation tooling is synchronized with these versions.

Development and both CI/release workflows now use Node 24.22.0, pinned in `.nvmrc`. Node 24 is the [current LTS line](https://nodejs.org/en/about/previous-releases). Run `nvm install` and `nvm use` from the repository before installing dependencies. The generated Installation and CLI engine range is `^24.15.0 || >=26.0.0`, matching jsdom 30.1.2's supported Node 24 minimum while also allowing Node 26+. `doctor` checks that range and gives a repair instruction for older runtimes. This is a raised minimum for the upcoming release; already-published 0.2.1 packages are unchanged.

Two compatibility constraints remain deliberate:

- TypeScript stays at 6.0.3. `typescript-eslint` 8.71.2 declares TypeScript `>=4.8.4 <6.1.0`; the repository also imports TypeScript's compiler API in an email-rendering behavior check. Moving to TypeScript 7 needs a separate compatible tooling migration.
- Node types use the Node 24 line, updated to 24.19.2, matching the selected LTS runtime rather than advertising Node 26 APIs.

Miniflare remains on its current stable release, 4.20260730.0; its newer v5 tag is beta. Package release versions remain 0.2.1 until the normal Changesets release process. This refresh does not deploy either app or publish packages.

Validation on Node 24.22.0: frozen-lockfile installation, 376 source tests across 60 files, type checks, lint, formatting, template synchronization/check, production builds, both deployment dry runs, and a clean packed Installation with 305 tests across 51 files plus types/lint/build/dry-run. The built local Worker returned healthy JSON, rendered `/submit` as HTML, and rejected invalid percent-encoding with HTTP 400. The portal's JavaScript is 312.8 KiB gzip across 35 chunks, within the 400 KiB total and 250 KiB per-chunk budgets. Final outdated-package inspection reports only the two compatibility constraints above.
