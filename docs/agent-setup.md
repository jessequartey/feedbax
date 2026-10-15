# Set up Feedbax with an agent

Use this guide when a person or coding agent is creating a portal, configuring copied source, or running this repository. Read the path that matches the task. A source checkout, a configured local portal, and a deployed installation are different completion states.

## 1. Choose the source

For the published 0.2.1 release, use Node 24 LTS and pnpm 10:

```sh
npx create-feedbax@0.2.1 my-feedback
```

The guided creator provisions or validates Notion sources, copies the app, generates local secrets, installs dependencies, and runs diagnostics. It has no non-interactive provisioning `--yes` flag.

For source copying without prompts, external service calls, or dependency installation:

```sh
npx create-feedbax@0.2.1 my-feedback --template-only
cd my-feedback
pnpm install
```

Template-only output is intentionally unconfigured. Do not substitute test IDs or use `src/feedbax.test-fixture.ts` as a real installation configuration.

For work on unreleased 0.2.2, use this repository with Node 24 LTS (24.15+; `.nvmrc` pins 24.22.0) and its workspace commands. Run `nvm install` and `nvm use` before installing dependencies. The published 0.2.1 creator includes Connected identity and social capabilities; GitHub commands require the matching 0.2.2 development creator/CLI. `pnpm packages:check` verifies the development packages by packing both CLIs and using them in an independent application.

## 2. Collect the required inputs

- Product name, description, portal HTTPS origin, and a distinct Cloudflare Worker name.
- For Notion: internal integration token and a parent page shared with that integration; enable read/update/insert content, plus read/insert Comments when Comments are enabled.
- Which independent capabilities are enabled: voting, Comments, and Changelog.
- For existing Notion sources: database IDs, data source IDs, and stable property IDs matching the canonical schema. Use [Notion setup](../apps/docs/content/docs/getting-started/notion.mdx); do not infer IDs from column titles.
- If Turnstile is enabled: the public site key and private secret.
- For Connected: the product application’s HTTPS origin/issuer, signed login endpoint, dedicated D1 database ID/name, a dedicated Cloudflare Queue for small processing, and an independent shared handoff secret. Follow [authentication setup](connected-profile.md).

Credentials belong in ignored local files or secret stores. Product settings and selected provider identifiers belong in `src/feedbax.ts`. Do not send the Notion token or signing keys to browser code.

For GitHub 0.2.2 development, first read [GitHub setup](../apps/docs/content/docs/getting-started/github.mdx). Collect the service origin, exact portal origin, distinct Feedbax Installation ID, repository numeric ID/owner/name, App bot ID, external GitHub App installation ID and explicitly provisioned D1 ID/name. Select `provider: "github"`, omit Notion configuration and disable Changelog. Keep the App key only in the separate service. Use the guide's local CLI instructions until 0.2.2 is published; a published 0.2.1 CLI lacks pairing commands.

## 3. Configure the owned application

After guided setup, check the generated `src/feedbax.ts`, `wrangler.jsonc`, and ignored `.dev.vars`. The printed trusted submission key belongs in the calling product’s server environment; the portal keeps only its SHA-256 base64url hash.

After template-only copying, configure those same files using the [configuration](../apps/docs/content/docs/operations/configuration.mdx) and [environment](../apps/docs/content/docs/operations/environment.mdx) guides. For Notion, supply real source/property IDs and its token. For GitHub, follow its guide for binding identifiers and bootstrap pairing credentials. Both paths need the trusted API-key hash and participation signing secret. Generate independent random secrets rather than copying the examples. Keep the required rate-limit bindings in Wrangler configuration.

For new Notion schemas, guided setup is the simplest supported path. Advanced automation can import the creator’s exported `provisionGuidedInstallation` function; its typed options are in [`packages/create-feedbax/src/index.ts`](../packages/create-feedbax/src/index.ts). It returns the plaintext trusted key once and previews external mutations. Template copying alone never provisions a schema.

For Connected small processing, create a queue with `pnpm exec wrangler queues create <queue-name>` before guided setup, and supply that name when prompted. The creator writes the producer and bounded consumer. For manual setup, follow the queue example in the authentication guide. Apply every included migration to the dedicated `FEEDBAX_DB` binding, configure `IDENTITY_HANDOFF_SECRET` on both servers, and implement the application handoff endpoint from the tested authentication guide. A Device Profile is not verified sign-in.

## 4. Verify local readiness

Run these commands from the generated application:

```sh
pnpm exec feedbax doctor
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm deploy:dry-run
pnpm dev
```

Open the address printed by the server. Verify enabled Feedback, Roadmap, Changelog, search, and Post detail views. Use a dedicated test workspace for submissions: new Posts must be unpublished until approved through the selected provider. Public GitHub issues remain public at their source even before portal publication. Check Comment read/reply/resolve behavior when enabled. Connected additionally needs the login/callback, second-browser Vote, logout, and verified attribution checks in the authentication guide.

If `doctor` fails, use its named repair instruction and rerun it. A successful build does not prove credentials or Notion permissions work. Report the failed check and missing input accurately if it cannot be supplied.

## 5. Deploy and report the actual outcome

Use the configured Cloudflare account and target:

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec feedbax deploy
```

The deployment command displays the Worker, hostnames, and secret names before publishing. Verify the resulting HTTPS URL and a real enabled flow. Keep local configuration and encrypted Worker secrets synchronized.

Finish with the installation directory, local/deployed URL as applicable, profile, enabled capabilities, check results, and any remaining inputs. Claim deployment only after the live URL works. Keep release notes unpublished until the actual release succeeds.

## Working inside this repository

Read root `AGENTS.md`, `CONTEXT.md`, and `SPEC.md`, then relevant ADRs and `TESTING.md`. Run `pnpm install --frozen-lockfile`, `pnpm dev:portal`, or `pnpm dev:docs`. The repository uses a monorepo; generated installations are flat apps and do not need its workspace layout.

After source changes, synchronize the owned-app template with `pnpm template:sync` and run the [README checks](../README.md#work-on-this-repository). UI work must keep the shadcn theme and Geist, use shared primitives, and pass the configured shadcn lint rules. Read [UI maintenance](shadcn-refresh-0.2.1.md) when refreshing components or changing lint contracts.

## Connected social features

For following, in-app/email notifications, or image attachments, use the full Connected guide (CONNECTED.md in a generated app; docs/connected-profile.md in the source repository). Apply every included D1 migration, including the Follow baseline migration, configure the timer and dedicated processing queue for small mode, choose Cloudflare/Resend/custom email when required, and keep the R2 bucket private for images. Never use a Device Profile as verified email evidence. Run doctor and behavior checks; explicitly distinguish local tests from real sender delivery and production authentication acceptance.

For an existing customized 0.2.1 Installation, use the [source upgrade guide](../apps/docs/content/docs/guides/upgrading.mdx) rather than scaffolding over it. Invoke the matching CLI outside the app manifest, inspect the private three-way diff, and keep source recovery separate from provider/D1/R2 backups and deployment. Full archive/isolated restore/provider migration remains pending acceptance.
