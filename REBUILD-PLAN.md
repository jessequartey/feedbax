# Feedbax Pre-Launch Rebuild Plan

Status: Proposed implementation plan  
Audience: Feedbax maintainers and contributors  
Delivery vehicle: One draft rebuild pull request with ordered, reviewable commits  
Compatibility posture: Breaking changes are allowed because Feedbax has no production users  
Supersedes: the earlier decision to defer a generator until after external installations

## 1. Executive summary

Feedbax will be rebuilt before its first public launch as a modular, self-hostable feedback portal with a generator-led setup experience.

The product promise for the first launch is:

> Create a themed feedback portal, connect it to Notion, choose a low-friction identity mode, and deploy it without building an authentication service or application backend first.

The two primary commands are:

```sh
npx create-feedbax@latest my-feedback
cd my-feedback
npx feedbax add <extension>
```

The rebuild will use:

- pnpm workspaces and Turborepo
- TanStack Start and React
- a conventional shadcn/ui monorepo setup
- Tailwind CSS and shadcn CSS variables for styling
- Effect, Effect Schema, and Effect Platform for application services, validation, typed failures, external I/O, retries, interruption, and observability
- TanStack Start server functions for same-origin application calls and server routes for HTTP endpoints
- Notion as the first work-tracking connector and initial no-database persistence option
- anonymous, email-only, and signed identity handoff modes
- Cloudflare, Vercel, and Node/Docker deployment targets

The existing implementation is reference material and a source of tested behavior. It is not the target structure. Domain rules, Notion fixtures, security behavior, health checks, and valuable tests should be ported deliberately; framework glue and cross-layer coupling should not be copied.

## 2. Outcomes and non-goals

### 2.1 Required outcomes

The rebuild is successful when a new user can:

1. Run `npx create-feedbax@latest`.
2. Select Notion, an identity mode, a deployment target, and an optional shadcn preset.
3. Receive a complete, understandable, editable project.
4. Configure secrets from a generated `.env.example`.
5. Run `npx feedbax doctor` and receive actionable setup results.
6. Start the portal locally and submit real feedback.
7. Change the theme through normal shadcn/Tailwind conventions.
8. Add or replace supported extensions through `npx feedbax add`.
9. Deploy to a documented and CI-verified target.

The team must also be able to:

- add a connector without changing the domain or portal routes;
- add an identity provider without changing feature components;
- test every connector and identity provider against shared contracts;
- distinguish expected application failures from defects;
- observe a request across transport, service, and connector boundaries;
- upgrade generated projects through explicit, documented migrations.

### 2.2 Non-goals for the rebuild PR

The rebuild PR will not implement:

- connectors other than Notion;
- full bidirectional task synchronization;
- managed Feedbax hosting;
- enterprise organizations, RBAC, or multi-tenancy;
- general analytics, NPS, surveys, a help desk, or session replay;
- real-time WebSockets;
- a visual theme builder owned by Feedbax;
- automatic conversion between arbitrary shadcn presets after users have heavily customized components;
- a public third-party plugin marketplace;
- an administrative product-management suite.
- a standalone headless RPC protocol or public OpenAPI product.

The architecture may expose stable seams for these features, but the PR must not build speculative systems for them.

## 3. Decisions fixed for this rebuild

These are implementation decisions, not open discussion items.

### 3.1 Product and installation

- `create-feedbax` creates a new project.
- `feedbax` is the lifecycle CLI used inside an existing Feedbax project.
- `feedbax add` installs and configures supported extensions.
- Generated projects are owned by the user. They are not hidden inside an opaque runtime package.
- The generator uses a versioned Feedbax template maintained in this repository.
- Better-T-Stack is a scaffolding and architecture reference, not a runtime dependency and not a command executed dynamically during every Feedbax installation.
- The generated output must be deterministic for a given Feedbax version, answers, package manager, and preset.
- The rebuild ships as the `0.1.0` first public preview. Publish `0.1.0-next.N` prereleases from the rebuild PR before promoting the approved release to `latest`.
- The intended npm names are `feedbax`, `create-feedbax`, and the `@feedbax/*` scope. They were unclaimed in the public npm registry when this plan was written; maintainers must secure the names/scope before implementation depends on them.

### 3.2 Application stack

- TanStack Start remains the application framework.
- React server rendering is the default.
- Reads should be started in parallel and streamed or deferred where useful.
- Client components must be limited to interactive UI.
- URL state owns shareable filters, sorting, search, and pagination.
- Effect application services are framework independent.
- TanStack server functions are the default same-origin React-to-server transport.
- TanStack server routes are the default transport for cacheable public HTTP, health checks, handoff/auth callbacks, RSS, webhooks, embed scripts, and future external APIs.
- TanStack transport handlers adapt requests to the Effect runtime; they do not contain domain logic.
- `@effect/platform` provides portable outbound HTTP and runtime services, including the Notion client; TanStack Start continues to own inbound routing and SSR.
- Server rendering invokes Effect services directly when already inside a safe server-only boundary rather than fetching the application over HTTP.
- A shared managed Effect runtime composes long-lived layers once per process/isolate; request context is provided per operation.

### 3.3 Contracts and validation

- New public contracts use Effect Schema.
- Application operations are transport neutral and return Effects.
- TanStack server-function validators and handlers adapt internal calls to operation contracts.
- TanStack server routes adapt HTTP semantics and map the same tagged failures to safe status codes and response schemas.
- Expected failures are typed tagged errors.
- Defects are logged with request context and converted to a sanitized internal error at the transport boundary.
- Existing Zod schemas may be used as porting references but will not remain as a second canonical contract system.
- `@effect/rpc` is optional and deferred until Feedbax needs a headless multi-client SDK, streaming RPC, custom serialization, or service-to-service communication.
- Effect HttpApi is optional and deferred until Feedbax needs a versioned public API or OpenAPI generation.

### 3.4 UI and theming

- The generated project is a normal shadcn project with a valid `components.json`.
- shadcn primitives live as source code in the UI workspace and remain editable.
- Feedbax feature components compose shadcn primitives instead of wrapping every primitive behind a proprietary abstraction.
- Standard shadcn variables remain canonical: `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `border`, `ring`, and `radius`.
- Feedbax introduces only necessary semantic status variables such as `feedback-new`, `feedback-planned`, `feedback-progress`, and `feedback-shipped`.
- The generator accepts a shadcn preset code. The preset is applied during project creation using a tested, pinned-compatible shadcn CLI version.
- Users may continue using the normal shadcn CLI after creation.
- The project must not claim that rerunning `shadcn init` is always a lossless theme migration after arbitrary local edits. Post-creation theme changes are CSS-variable/component-source changes unless a tested migration command exists.

### 3.5 Persistence boundaries

- A connector represents the team's work-tracking backend.
- An interaction store represents identities, votes, subscriptions, idempotency records, and other state that may require stronger guarantees.
- One adapter may implement both roles. The Notion launch adapter will do so for the database-free path.
- Capabilities are declared honestly. The UI and server must not assume every adapter supports atomic voting, comments, webhooks, or full-text search.
- Secrets are server-only and never serialized into browser bundles or public configuration.

### 3.6 Identity and authorization

- Identity answers “who is this visitor?” Authorization answers “what may this visitor do?” They are separate concepts.
- Anonymous and email-only modes require no external auth service.
- Email-only mode captures an email but does not claim ownership verification.
- Local storage is never authoritative for identity, authorization, votes, or email.
- Signed, HTTP-only cookies contain an opaque subject/session identifier, not a plaintext email.
- Better Auth and SQL-backed interaction stores are deferred until after `0.1.0`.

## 4. Repository architecture

### 4.1 Target development repository

```text
apps/
  portal/                     Public Feedbax portal
  docs/                       Documentation and marketing site
  playground/                 Fixture-backed development and visual testing

packages/
  domain/                     Entities, value objects, policies, domain errors
  contracts/                  Effect Schemas and transport-neutral operations
  server/                     Use cases and application service composition
  config/                     Runtime configuration contracts and loading
  connector-sdk/              Work-tracking connector interfaces and helpers
  connector-testkit/          Connector compliance suite
  identity/                   Identity contracts and built-in providers
  storage/                    Interaction-store contracts
  ui/                         shadcn primitives, feature components, styles
  observability/              Request context, logs, metrics, tracing helpers
  cli/                        `feedbax` lifecycle CLI
  create-feedbax/             Project generator executable
  testing/                    Shared fixtures and test layers

connectors/
  notion/                     Notion connector and Notion interaction store

adapters/
  deploy-cloudflare/          Cloudflare configuration and runtime layer
  deploy-vercel/              Vercel configuration and runtime layer
  deploy-node/                Node/Docker configuration and runtime layer

templates/
  default/                    Versioned generated-project template

examples/
  identity-handoff/           Host application integration example
  custom-theme/               shadcn customization example

tooling/
  eslint/
  typescript/
  vitest/
```

Directories should be created only when their first real implementation is added. Empty placeholder packages are not required.

### 4.2 Published package plan

Packages intended for the first public release:

| Package                 | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `create-feedbax`        | `npm create`/`npx` project generator                             |
| `feedbax`               | Lifecycle CLI and `add`, `doctor`, `dev`, and `upgrade` commands |
| `@feedbax/core`         | Stable domain-facing public types and extension contracts        |
| `@feedbax/notion`       | Notion connector and optional Notion interaction storage         |
| `@feedbax/auth-handoff` | Signed identity handoff provider and host helpers                |

Workspace-only initially:

- server implementation;
- UI workspace;
- observability helpers;
- configuration internals;
- test fixtures;
- deployment helpers.

Do not publish a package solely because it exists in the monorepo. Publish only APIs required by generated applications or extension authors.

### 4.3 Dependency rules

```text
domain
  imports Effect core and Schema only

contracts
  imports domain and Effect Schema

connector-sdk / identity / storage
  import domain and shared contracts

server
  imports domain, contracts, connector-sdk, identity, storage, observability

connectors and adapters
  import their SDK contract, never portal code

ui
  imports public domain/transport result types, never server or connector code

portal
  composes server layers and UI
```

Enforce these rules with package exports, ESLint restricted imports, and a circular-dependency check in CI.

## 5. Generated project contract

Every project created by `create-feedbax` must include:

```text
my-feedback/
  apps/
    portal/
      components.json
      src/
        components/
        features/
        routes/
        styles/
  packages/
    ui/
      src/components/ui/
      src/styles/globals.css
  feedbax.config.ts
  feedbax.jsonc
  .env.example
  package.json
  pnpm-workspace.yaml
  turbo.json
  README.md
```

### 5.1 Configuration ownership

Use two configuration files with different responsibilities:

`feedbax.jsonc` is CLI-owned installation metadata:

```jsonc
{
  "$schema": "https://feedbax.dev/schema/project.json",
  "version": 1,
  "connector": "notion",
  "identity": "email",
  "interactionStore": "notion",
  "deployment": "cloudflare",
  "packageManager": "pnpm",
  "shadcn": {
    "preset": "b0",
    "workspace": "packages/ui",
  },
}
```

`feedbax.config.ts` is user-owned product configuration:

```ts
import { defineConfig } from '@feedbax/core'

export default defineConfig({
  branding: {
    name: 'Acme Feedback',
    description: 'Help us decide what to build next',
  },
  features: {
    comments: true,
    roadmap: true,
    changelog: true,
  },
  statuses: [
    { id: 'new', label: 'New' },
    { id: 'planned', label: 'Planned' },
    { id: 'shipped', label: 'Shipped', terminal: true },
  ],
})
```

Rules:

- The CLI may update `feedbax.jsonc` while preserving comments and formatting.
- The CLI must not destructively rewrite arbitrary user code in `feedbax.config.ts`.
- Runtime wiring generated from `feedbax.jsonc` must be deterministic and committed so builds do not require network access.
- Secrets belong in environment variables and secret stores, never either config file.
- Every generated environment variable appears in `.env.example` with a non-secret description.

## 6. Domain and service model

### 6.1 Core entities

The initial domain contains:

- `FeedbackItem`
- `Comment`
- `Vote`
- `VisitorIdentity`
- `Status`
- `Category`
- `Tag`
- `RoadmapEntry`
- `ChangelogEntry`
- `Subscription`
- `ConnectorReference`

Identifiers are branded and never interchangeable. Public and private projections are distinct. Private email, external record identifiers, internal roles, and connector diagnostics are not part of public projections.

### 6.2 Application operations

Public reads:

- `ListFeedback`
- `GetFeedback`
- `SuggestDuplicateFeedback`
- `ListRoadmap`
- `ListChangelog`
- `GetChangelogEntry`
- `GetViewerContext`

Public mutations:

- `SubmitFeedback`
- `SetVote`
- `CreateComment`
- `SetSubscription`
- `RememberEmailIdentity`
- `ForgetIdentity`

Administrative operations are limited to what is required for the launch loop:

- `UpdateFeedbackStatus`
- `LinkChangelogEntry`
- `PublishChangelogEntry`

Administrative operations may initially remain connector-driven if the team performs them directly in Notion. Do not build an admin interface merely to expose these contracts.

### 6.3 Error model

Expected failures must be typed and serializable:

| Error                   | Meaning                                     | Retryable        |
| ----------------------- | ------------------------------------------- | ---------------- |
| `ValidationError`       | Input or query is invalid                   | No               |
| `IdentityRequired`      | Operation needs an identified visitor       | No               |
| `PermissionDenied`      | Identity lacks permission                   | No               |
| `NotFound`              | Requested public resource does not exist    | No               |
| `Conflict`              | Idempotency or state conflict               | Sometimes        |
| `RateLimited`           | Request/action limit exceeded               | Yes, after delay |
| `CapabilityUnavailable` | Configured adapter cannot perform operation | No               |
| `ConnectorUnavailable`  | External provider failed or timed out       | Yes              |
| `StorageUnavailable`    | Interaction store failed or timed out       | Yes              |
| `ConfigurationError`    | Installation is incomplete or invalid       | No               |
| `InternalError`         | Sanitized unexpected defect                 | Maybe            |

Every public error contains a stable code, safe message, request ID, and retry metadata where applicable. Connector response bodies, secrets, stack traces, emails, and raw Effect causes never cross the public boundary.

### 6.4 Effect service layers

Define Effect services for:

- `FeedbackRepository`
- `RoadmapRepository`
- `ChangelogRepository`
- `InteractionStore`
- `IdentityProvider`
- `RateLimiter`
- `CaptchaProvider`
- `Cache`
- `Clock`
- `IdGenerator`
- `RequestContext`
- `Telemetry`
- `NotificationPublisher`

The launch runtime composes concrete layers once at the application boundary. Feature code requests interfaces through Effect context and must not instantiate Notion clients, cookies, databases, or loggers directly.

Provider adapters use `@effect/platform` services for outbound HTTP and other portable runtime I/O. Do not launch a second Effect HTTP server inside TanStack Start for `0.1.0`; TanStack owns the incoming request lifecycle.

### 6.5 Transport boundary and middleware order

Use one shared adapter for TanStack server functions and one shared adapter for TanStack server routes. Both execute the same transport-neutral Effect operations and apply the same error classification, request context, security policy, and telemetry.

Server functions return schema-encoded serializable results appropriate for the same-origin application. Server routes return standard `Response` values with explicit methods, status codes, cache headers, and content types.

The transport adapters use a managed Effect runtime composed at the server module boundary. They must not rebuild all long-lived layers for every request. Request-specific identity, cookies, request ID, origin, and network information are provided to each operation as scoped context.

Apply middleware consistently in this order:

1. Request ID and request context
2. Structured logging and tracing span
3. Body-size and protocol validation
4. Origin/CSRF checks for mutations
5. Identity/session resolution
6. Global rate limit
7. Action-specific rate limit
8. Authorization/capability check
9. Handler execution
10. Public error conversion and telemetry completion

Reads may be cached only after public projection and identity-sensitive fields are separated. Mutation responses and identified viewer state use private/no-store caching.

### 6.6 Retry and idempotency rules

- External reads may use bounded exponential backoff with jitter.
- Respect provider `Retry-After` headers.
- Every external operation has a timeout and responds to interruption.
- Mutations are not automatically retried unless they carry an idempotency key and the adapter implements idempotency.
- Submission and comment inputs include a client request ID.
- Vote changes use desired state (`voted: true/false`), not toggle semantics.
- Logs record retry count and final classified failure without recording private content.

## 7. Identity modes

The generator presents identity as a product choice, not an authentication-library choice.

Prompt:

```text
How should visitors identify themselves?

No identity required
Ask for an email and remember it
Use identity from my existing application
```

### 7.1 Anonymous

Meaning:

- Anyone may submit without entering identity information.
- The public author label defaults to “Anonymous”.
- The server may issue a signed device cookie for abuse controls and best-effort vote uniqueness.
- Clearing the cookie creates a new device identity.
- Anonymous mode makes no claim of durable person-level uniqueness.

Mutation policy defaults:

- submission: allowed;
- comments: configurable, allowed by default with stronger rate limits;
- votes: allowed with best-effort device uniqueness;
- subscriptions: unavailable without a destination.

The cookie contains an opaque random device subject and version. It uses `HttpOnly`, `Secure` in production, `SameSite=Lax`, a scoped path, rotation support, and a bounded lifetime.

### 7.2 Email only

Meaning:

- The first identity-requiring action asks for an email.
- Feedbax validates and stores the email in the configured private identity/interaction storage.
- Feedbax creates a signed session cookie containing only an opaque subject/session ID.
- Later actions resolve the email server-side and do not ask again while the session remains valid.
- Email ownership is not verified and the UI/documentation must say so.

Required behavior:

- normalize email for lookup without altering the original display value incorrectly;
- never expose email on public feedback projections;
- allow the visitor to forget the remembered identity;
- rotate the cookie after identity creation;
- handle a missing/deleted server-side identity by clearing the stale cookie;
- do not use local storage as authority;
- optionally use local storage only for non-sensitive form convenience, under a versioned schema.

For the Notion-only launch path, provisioning creates or maps a private identities data source. Feedback, comments, and votes reference the opaque identity ID. The Notion health check verifies that private identity fields are not part of public projections.

### 7.3 Signed identity handoff

Meaning:

- An existing application is the identity authority.
- It creates a short-lived signed assertion containing issuer, audience, subject, issue time, expiry, and optional public profile claims.
- Feedbax validates the assertion server-side, creates its own session cookie, and redirects to a clean return URL.

Requirements:

- asymmetric signatures are the recommended default;
- issuer, audience, expiry, clock skew, algorithm, and return path are validated;
- assertions are short lived;
- replay protection is supported for one-time handoffs;
- query parameters are never trusted as identity by themselves;
- host helper packages and a complete example are published;
- logout clears the Feedbax session and may redirect to an allowlisted host URL.

### 7.4 Deferred authenticated identity

Better Auth, SQLite, and Postgres are deferred until after `0.1.0`. The launch CLI rejects these values before writing files and points users to the supported anonymous, email-only, and signed-handoff modes.

### 7.5 Roles and administration

Visitor identity does not automatically grant team access. Administrative roles are derived from trusted handoff claims or server configuration. Email-only and anonymous identities never become administrators based solely on a submitted email address.

## 8. Connector and storage architecture

### 8.1 Connector contract

Every connector exposes:

```text
descriptor
capabilities
healthCheck
feedbackReader
feedbackWriter (optional)
roadmapReader (optional)
changelogReader (optional)
webhookSupport (optional)
```

Initial capabilities:

```text
feedback.read
feedback.write
feedback.search
comments.read
comments.write
votes.read
votes.atomic
roadmap.read
changelog.read
changelog.write
webhooks
```

The server checks capabilities before invoking optional behavior. The portal hides or disables unavailable product features with a useful explanation.

### 8.2 Connector testkit

All connectors must pass shared tests for:

- schema decoding and canonical projections;
- stable identifiers;
- pagination and cursor bounds;
- capability accuracy;
- timeout and cancellation;
- retryable versus non-retryable error classification;
- rate-limit response handling;
- secret and response-body redaction;
- idempotent mutation behavior where declared;
- public/private field separation;
- empty results versus provider failures.

The testkit provides deterministic fixtures and optional live-provider tests. Live tests are never required for ordinary contributor unit-test runs.

### 8.3 Notion launch adapter

The Notion adapter must support:

- feedback list/detail/read/write;
- duplicate suggestion inputs;
- comments;
- best-effort or atomic-equivalent voting with honest capability declaration;
- roadmap and changelog reads;
- private identity records for email-only mode;
- subscriptions only if the selected schema supports them;
- schema provisioning and health diagnostics;
- bounded pagination, caching, timeouts, and error normalization.

The team must decide during implementation whether votes can truthfully declare `votes.atomic`. If they cannot, the capability remains false and the UI/documentation labels uniqueness as best effort.

Port and improve the existing Notion doctor, provisioning scripts, fixtures, and smoke tests. Do not retain direct Notion imports in config or portal packages.

### 8.4 Initial Notion data model

The provisioner creates or validates separate data sources so private identity and interaction records never have to be projected as public feedback fields.

| Data source   | Required launch fields                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Feedback      | title, description, type, status, category, tags, public author reference, private identity reference, created/updated times |
| Identities    | opaque subject, kind, private email, optional display name/avatar, created time, last-seen time                              |
| Votes         | deterministic key, feedback relation, identity/device subject, desired active state, created/updated times                   |
| Comments      | request ID/key, feedback relation, identity relation, body, public author name, author kind, created/updated times           |
| Changelog     | title, description, slug, published flag/time, version, tags, cover image, linked feedback relations                         |
| Subscriptions | identity relation, target type/ID, active state, created/updated times; created only when enabled                            |

Roadmap entries may initially be public feedback items grouped by configured statuses. Do not create a separate roadmap data source unless a demonstrated requirement cannot be represented by feedback status.

Rules:

- Data-source IDs and field mappings are configuration; property display names are not hardcoded domain assumptions.
- Public queries explicitly select/map allowed fields rather than serializing Notion pages.
- Identity email exists only in the private identities data source.
- Vote keys are based on opaque identity/device subjects, never plaintext email.
- Derived vote/comment counts are treated as denormalized projections and repaired or recomputed when inconsistency is detected.
- Provisioning is idempotent and reports every manual Notion permission/share step.
- Doctor validates property type, write permission, relations, integration access, and capability prerequisites.
- The provisioner prints planned schema changes before applying them and never deletes a user's property or data source.

## 9. UI implementation

### 9.1 shadcn baseline

Scaffold the UI in shadcn monorepo mode. Maintain:

- valid root/application `components.json` paths;
- standard aliases;
- Tailwind configuration expected by the selected shadcn version;
- CSS variables in the normal global stylesheet;
- direct source ownership of generated primitives;
- compatibility with `shadcn add ... -c apps/portal` or the documented workspace target.

The generator offers:

```sh
npx create-feedbax@latest my-feedback --preset b0
```

Interactive users may paste or select a preset produced by shadcn/create. The exact preset and tested shadcn CLI version are recorded in `feedbax.jsonc`.

CI must generate and build at least:

- the default Feedbax preset;
- one alternative base/style preset;
- one alternative font/icon/color preset.

### 9.2 UI package rules

```text
packages/ui/src/components/ui/*
  shadcn primitives

packages/ui/src/components/feedbax/*
  reusable product compositions

apps/portal/src/features/*
  route/use-case feature components
```

- Primitive components contain no Feedbax business rules.
- Product compositions receive public view models and callbacks.
- Server-function calls and route loading remain in application feature code.
- Avoid broad barrel imports on performance-sensitive paths.
- Dynamically load heavy editors, command palettes, or optional visualization code.
- Do not serialize private server objects into React client props.

### 9.3 Launch pages and states

Required routes:

- feedback board;
- feedback detail;
- submission flow with duplicate suggestions;
- roadmap;
- changelog list;
- changelog detail;
- identity handoff callback;
- logout/forget identity;
- health endpoint;
- public HTTP endpoints required for cacheable content or integrations.

Every data surface must distinguish:

- initial loading;
- empty content;
- filtered empty content;
- identity required;
- capability unavailable;
- rate limited;
- connector unavailable;
- recoverable retry;
- unexpected failure.

### 9.4 Accessibility and responsive behavior

- WCAG 2.2 AA is the target.
- All actions are keyboard reachable.
- Focus is restored correctly after dialogs and mutations.
- Status is not conveyed by color alone.
- Light and dark themes pass contrast checks.
- Motion respects `prefers-reduced-motion`.
- Form errors are associated with controls and summarized when appropriate.
- Board, detail, roadmap, and submission flows are tested at mobile and desktop breakpoints.

## 10. CLI specification

### 10.1 `create-feedbax`

Supported invocation:

```sh
npx create-feedbax@latest [directory]
```

Required flags:

```text
--connector notion
--identity anonymous|email|handoff
--storage notion
--deploy cloudflare|vercel|node
--preset <shadcn-preset>
--package-manager npm|pnpm
--yes
--no-install
--no-git
```

Only tested combinations are shown interactively. Unsupported flag combinations fail before files are written.

The first release supports npm and pnpm project generation. Yarn and Bun may be added only after their create, install, shadcn, add, doctor, and build paths are covered in CI.

Generation pipeline:

1. Validate directory and flags.
2. Resolve a compatibility-tested stack selection.
3. Copy the versioned Feedbax template.
4. Apply template variables.
5. Initialize/apply the selected shadcn preset using the pinned-compatible mechanism.
6. Add the exact shadcn primitives required by Feedbax.
7. Install selected Feedbax extensions.
8. Create `feedbax.jsonc`, `feedbax.config.ts`, and `.env.example`.
9. Install dependencies unless disabled.
10. Run formatting, type checking, and a generated-project smoke check.
11. Initialize Git unless disabled.
12. Print only actionable next steps.

The CLI must roll back or leave a clearly marked recoverable directory on failure. It must never overwrite a non-empty directory without explicit confirmation.

### 10.2 `feedbax add`

Initial commands:

```sh
npx feedbax add connector notion
npx feedbax add identity anonymous
npx feedbax add identity email
npx feedbax add identity handoff
npx feedbax add storage notion
npx feedbax add deploy cloudflare
npx feedbax add deploy vercel
npx feedbax add deploy node
```

An add operation performs a transaction-like plan:

1. Read and validate `feedbax.jsonc`.
2. Detect the package manager and current project version.
3. Validate compatibility with installed choices.
4. Show the proposed files, packages, environment variables, and migrations.
5. Install exact compatible packages.
6. Update CLI-owned configuration while preserving formatting/comments.
7. Generate deterministic runtime wiring.
8. Update `.env.example` without writing secrets.
9. Add migrations or provider setup files.
10. Format changed files.
11. Run targeted validation and `feedbax doctor`.
12. Report success, warnings, and manual actions.

If a step fails, restore files changed by the command where safe and print recovery instructions. Never remove user code or uninstall a previous provider without explicit replacement confirmation.

### 10.3 Other lifecycle commands

```text
feedbax doctor       Validate config, environment, schema, connectivity, and capabilities
feedbax dev          Run preflight checks, then start the supported dev command
feedbax info         Print sanitized installed versions and capabilities
feedbax upgrade      Apply versioned, reviewable migrations
feedbax env          Print required environment variable names, never values
```

`doctor` exits non-zero for blocking failures and zero with warnings for degraded optional capabilities. Every failure includes the exact owner (project, identity, connector, storage, or deployment) and a remediation.

### 10.4 CLI implementation quality

- Use structured command definitions and test prompts separately from execution.
- Business logic returns Effects; terminal rendering is a boundary.
- All filesystem mutations are tested against temporary fixtures.
- Support non-interactive CI usage.
- Do not collect telemetry in the first release unless separately approved and documented.
- Snapshot the generated file tree and run real installs/builds in CI.

### 10.5 Package versioning and publishing

- Use Changesets for public package changes and release notes.
- Version the first public packages together until extension compatibility requirements are proven.
- Publish prereleases from the rebuild branch under a non-`latest` npm tag.
- Run `npm pack` for every public package in CI and test from tarballs rather than relying only on workspace links.
- Verify package exports, type declarations, executable permissions, shebangs, license, README, and included-file lists.
- Reject packed manifests containing unresolved `workspace:*` dependencies.
- Publish with npm provenance from protected CI after the merge commit passes all release gates.
- Never publish from a contributor workstation as the normal release path.
- `create-feedbax` records its version in generated metadata so `feedbax upgrade` can choose migrations deterministically.

## 11. Security requirements

The PR cannot merge unless these are implemented and tested:

- server-only secrets and bundle checks;
- secure cookie defaults and secret rotation support;
- exact origin checks for browser mutations;
- request and action rate limiting;
- bounded request bodies and pagination;
- output encoding and safe Markdown rendering;
- return-URL allowlisting;
- handoff issuer/audience/expiry/signature validation;
- no authorization based on client-supplied email, role, vote count, or author ID;
- private/public projection separation;
- no raw provider error bodies in public responses;
- idempotency for replay-prone mutations;
- dependency audit and lockfile review;
- documented production requirements for durable distributed rate limiting;
- optional CAPTCHA integration seam without making CAPTCHA mandatory for local development.

Threat-model at minimum:

- forged identity cookie;
- handoff replay;
- CSRF submission;
- vote inflation by cookie deletion;
- email impersonation in email-only mode;
- spam and oversized bodies;
- Notion token leakage;
- public cache containing viewer-specific state;
- open redirects;
- connector timeout/resource exhaustion.

Known limitations, such as email impersonation and device-level rather than person-level anonymous uniqueness, must be documented rather than obscured.

## 12. Caching, performance, and observability

### 12.1 Caching

- Cache public connector reads by board and normalized query.
- Never cache private identity or viewer state in shared caches.
- Fetch viewer vote state separately or merge it after the shared public projection.
- Invalidate or revalidate affected keys after mutations.
- Use stale-while-revalidate only where stale data is safe and visible behavior remains understandable.
- Bound cache entries, TTLs, and connector page sizes.

### 12.2 Performance budgets

Initial budgets, measured on the production portal build:

- board route initial JavaScript: no more than 180 KB gzip;
- route CSS: no more than 50 KB gzip;
- no per-feedback-item connector request waterfall on list pages;
- independent server reads run in parallel;
- p75 local fixture LCP under 2.5 seconds in the agreed Lighthouse profile;
- mutation UI acknowledges interaction within 100 ms and exposes pending state;
- optional heavy features are route- or interaction-loaded.

If a budget is exceeded, the PR must include the measured reason and an approved exception rather than silently changing the budget.

### 12.3 Observability

Structured events include:

- request ID;
- operation name;
- deployment/runtime;
- connector and storage identifiers;
- duration;
- retry count;
- cache status;
- outcome and public error code;
- hashed or opaque actor/network keys where needed for security.

Never log feedback bodies, comment bodies, emails, tokens, cookies, or raw provider responses by default. OpenTelemetry integration should be possible through a layer but is not required to operate the default project.

## 13. Testing strategy

### 13.1 Test layers

Unit tests:

- schemas, branded IDs, policies, projections, error mapping;
- identity cookie signing/rotation;
- email normalization and privacy;
- retry/idempotency decisions;
- CLI compatibility rules and config edits.

Service tests:

- Effect use cases with in-memory layers;
- typed expected failures and defects;
- TestClock-driven timeout/retry/rate-limit behavior;
- cache separation and invalidation.

Contract tests:

- every connector through `connector-testkit`;
- every identity provider through an identity testkit;
- every interaction store through a storage testkit;
- Effect Schema encode/decode round trips for all successes and failures;
- server-function result mapping and server-route HTTP error/status mapping.

Integration tests:

- portal to TanStack server function/route to Effect service to fixture adapter;
- anonymous, email, and handoff session flows;
- Notion adapter against deterministic mocked API responses;
- CLI create/add/doctor/upgrade in temporary projects.

End-to-end tests:

- browse, search, filter, submit, vote, comment, roadmap, and changelog;
- duplicate suggestions during submission;
- identity remembered and forgotten;
- keyboard and accessibility flows;
- error, empty, degraded-capability, and connector-outage states.

Deployment tests:

- production build and smoke test for Cloudflare;
- production build and smoke test for Vercel;
- production build and container smoke test for Node/Docker;
- server-only secret probe on each target;
- server-function and server-route cookie/origin behavior on each target.

Live tests:

- opt-in or scheduled Notion smoke tests using a dedicated test workspace;
- no live secret required for pull requests from forks;
- cleanup or deterministic reuse of smoke records.

### 13.2 Generator matrix

At minimum CI generates and verifies:

| Connector | Identity  | Storage | Deploy     | Package manager |
| --------- | --------- | ------- | ---------- | --------------- |
| Notion    | Anonymous | Notion  | Cloudflare | pnpm            |
| Notion    | Email     | Notion  | Node       | npm             |
| Notion    | Handoff   | Notion  | Vercel     | pnpm            |

The full combinatorial matrix is unnecessary. Pairwise coverage plus explicit compatibility-rule tests is sufficient.

## 14. Documentation deliverables

The rebuild PR includes:

- five-minute quickstart;
- CLI command and flag reference;
- shadcn preset and post-generation theming guide;
- identity mode comparison with honest guarantees;
- Notion provisioning and health-check guide;
- signed handoff integration guide and runnable example;
- Cloudflare, Vercel, and Docker deployment guides;
- connector author guide and testkit instructions;
- security model and production checklist;
- configuration reference;
- troubleshooting guide based on doctor error codes;
- architecture overview and dependency rules;
- upgrade policy.

Documentation commands must be copied into CI smoke tests where practical so they cannot drift unnoticed.

## 15. Rebuild pull request strategy

### 15.1 Branch and preservation

1. Start from current `main`.
2. Create `feat/prelaunch-rebuild`.
3. Record the current main commit in the PR description.
4. Create a maintainer-approved tag or branch for the pre-rebuild implementation before merge.
5. Open the PR as a draft immediately.
6. Keep the PR description updated with checkpoint status and architecture decisions.

Because there are no external users, the team does not need runtime backward compatibility or data migrations for published installations. Preserve Git history and retain useful fixtures/tests, but prefer a clean target over compatibility shims.

### 15.2 Ordered implementation checkpoints

The PR should be reviewable by checkpoint. Each checkpoint must leave the repository type-checking and its relevant tests passing.

#### Checkpoint 0: Baseline and decision freeze

Deliver:

- this plan approved;
- current build/test baseline recorded;
- target package map and dependency rules documented;
- npm package names/scope secured and the `0.1.0` release line recorded;
- current implementation preservation tag/branch created;
- unsupported scope explicitly listed in the PR.

Gate:

- no scaffold or dependency churn before decisions are approved.

#### Checkpoint 1: Clean Better-T-Stack-style scaffold

Scaffold procedure:

1. In a disposable directory, run a pinned release of `create-better-t-stack`.
2. Select TanStack Start, a self-contained backend/runtime, no generated API layer, no database, no auth provider, Turborepo, and shadcn/Tailwind support where offered.
3. Record the Better-T-Stack version, exact command/answers, dependency versions, and generated tree in the PR.
4. Verify the disposable scaffold before copying any structure.
5. Bring the proven workspace/application/tooling structure into Feedbax without its Git metadata, example domain, generated API choice, or unused dependencies.
6. Initialize the chosen shadcn monorepo preset through the official shadcn CLI.
7. Commit the resulting Feedbax-owned scaffold and lockfile. Future generation uses the versioned Feedbax template, not a network call to Better-T-Stack.

Deliver:

- pnpm/Turbo workspace reset;
- TanStack Start portal shell;
- docs and playground shells only if immediately used;
- shared TypeScript, lint, format, and test configuration;
- conventional shadcn monorepo initialization;
- default `components.json` and theme;
- CI for install, format check, type check, lint, test, and build.

Gate:

- clean clone installs and builds;
- shadcn can add a component to the intended UI workspace;
- an alternate preset generation smoke test passes.

#### Checkpoint 2: Domain, contracts, and Effect runtime

Deliver:

- domain entities and public/private projections;
- Effect Schema contracts;
- transport-neutral application operations;
- typed error taxonomy;
- service tags and test layers;
- shared managed runtime, request context, and public error conversion;
- TanStack server-function and server-route execution adapters;
- in-memory application implementation.

Gate:

- every launch operation has a schema and typed error channel;
- schema round-trip, server-function result, and server-route HTTP mapping tests pass;
- the server reuses the managed runtime instead of reconstructing long-lived layers per request;
- server rendering does not fetch Feedbax's own HTTP endpoints;
- client bundles contain no connector, storage, runtime composition, or server-secret modules;
- no portal, connector, or runtime dependency enters the domain package.

#### Checkpoint 3: Identity and interaction storage

Deliver:

- anonymous provider;
- email-only provider;
- signed handoff provider;
- interaction-store contract and in-memory test implementation;
- identity/storage compliance tests;
- cookie, origin, rate-limit, and idempotency middleware.

Gate:

- all three identity flows pass integration and security tests;
- deferred Better Auth and SQL storage selections are rejected before mutation;
- email never appears in public projections or client-trusted state.

#### Checkpoint 4: Notion adapter

Deliver:

- Notion connector on the new SDK;
- Notion interaction storage needed by anonymous/email paths;
- schema provisioner and doctor checks;
- mapped reads and mutations;
- caching, timeouts, error classification, and capability declaration;
- deterministic and live-smoke test paths.

Gate:

- connector testkit passes;
- Notion secret cannot enter a client bundle;
- empty content and provider failure are observably different;
- dogfood fixture can complete the core feedback loop.

#### Checkpoint 5: Portal vertical slices

Deliver in this order:

1. board and filters;
2. feedback detail;
3. submission and duplicate suggestions;
4. voting;
5. comments;
6. roadmap;
7. changelog and shipped-feedback link;
8. identity UI and session controls;
9. all error/degraded states.

Gate:

- end-to-end suite passes for anonymous and email modes;
- handoff flows pass targeted E2E tests;
- accessibility and performance budgets pass;
- no per-item read waterfall exists.

#### Checkpoint 6: Generator and lifecycle CLI

Deliver:

- versioned default template;
- `create-feedbax` prompts and flags;
- compatibility resolver;
- shadcn preset application;
- `feedbax add`, `doctor`, `dev`, `info`, and initial `upgrade` framework;
- transactional filesystem edits and recovery;
- generated-project test matrix.

Gate:

- a clean generated project works through npm `npx` and pnpm;
- every documented initial add command is tested;
- generated projects build without access to the Feedbax source monorepo;
- repeated doctor runs are idempotent.

#### Checkpoint 7: Deployment, documentation, and dogfood

Deliver:

- Cloudflare, Vercel, and Node/Docker presets;
- target-specific smoke tests;
- complete documentation set;
- dogfood deployment using the generated-project path;
- security and dependency review;
- bundle and performance report;
- release notes and known limitations.

Gate:

- all release gates in section 18 pass;
- a second person follows the quickstart without maintainer intervention;
- no documentation claim lacks a tested path.

#### Checkpoint 8: Remove superseded implementation

Deliver:

- deletion of obsolete packages, routes, configs, and dependencies;
- intentional port or deletion list for old tests and scripts;
- updated root README, roadmap, contributing, security, and architecture docs;
- clean dependency graph and lockfile;
- final license/header review.

Gate:

- no unused compatibility layer remains “just in case”;
- repository search finds no old package names or obsolete setup commands;
- full CI runs from an uncached clean checkout.

### 15.3 Commit discipline inside the PR

Use coherent commits aligned with checkpoints. Avoid one deletion-and-regeneration commit containing unrelated product behavior. Suggested commit subjects:

```text
chore: establish pre-launch rebuild scaffold
feat: define Effect domain and service contracts
feat: add visitor identity and interaction storage
feat: implement Notion connector on the new SDK
feat: rebuild portal with shadcn components
feat: add create-feedbax generator
feat: add feedbax lifecycle commands
feat: verify deployment targets and document setup
chore: remove superseded implementation
```

Do not squash during active review. The final merge strategy may squash after reviewers have approved the checkpoint history.

## 16. Team work breakdown

Recommended workstreams:

| Workstream             | Owns                                                           | Depends on                    |
| ---------------------- | -------------------------------------------------------------- | ----------------------------- |
| Architecture/contracts | Domain, schemas, operations, errors, dependency rules          | Checkpoint 1                  |
| Runtime/security       | Effect layers, middleware, cookies, rate limits, observability | Contracts                     |
| Connector              | SDK, testkit, Notion, doctor/provisioning                      | Contracts, storage            |
| Identity               | Four providers and compliance suite                            | Contracts, runtime            |
| Portal/UI              | shadcn scaffold, feature UI, accessibility                     | Operation/transport contracts |
| CLI                    | Generator, compatibility rules, add/doctor/upgrade             | Package APIs and template     |
| Deployment/quality     | CI, deploy targets, E2E, performance, docs                     | Vertical slice                |

Coordination rules:

- Contract changes require review from affected workstream owners.
- Feature work begins from schemas and acceptance tests, not ad hoc route types.
- Workstreams may use short-lived branches but integrate into the single draft rebuild branch at checkpoint boundaries.
- Generated files and package exports are reviewed like source code.
- Any scope expansion must identify the launch outcome it improves and update this plan/PR description.

## 17. Review checklist

Reviewers should answer:

Architecture:

- Are framework, connector, identity, storage, and UI boundaries enforceable?
- Does any low-level package import an application or concrete adapter?
- Is Effect providing typed composition rather than being a wrapper around existing promises?
- Is there only one canonical schema for each public contract?

Product:

- Can a founder collect feedback without configuring an auth service?
- Are anonymous and email-only guarantees described honestly?
- Can a mature application use handoff without duplicating accounts?
- Can full auth be added without changing domain or feature UI code?

UI:

- Is this recognizably a conventional shadcn project?
- Can standard shadcn commands target the correct workspace?
- Are theme values standard CSS variables rather than hardcoded product colors?
- Do alternate presets preserve usable layout and accessibility?

CLI:

- Does creation produce a standalone, owned project?
- Are unsupported combinations rejected before mutation?
- Are file changes previewable, deterministic, and recoverable?
- Does `doctor` explain what to do next?

Operations:

- Do all three deployments handle cookies, secrets, RPC, and caching correctly?
- Are expected errors observable without leaking private data?
- Can provider failure be distinguished from empty data?
- Are production-only requirements documented?

## 18. Definition of done and release gates

The rebuild PR is complete only when all of the following are true.

### Installation

- [x] `npx create-feedbax@latest` works in a clean temporary environment.
- [x] pnpm generation also works.
- [x] Default interactive answers produce a working project.
- [x] `--yes` produces a documented default stack.
- [x] The generated README contains exact next steps.
- [x] `feedbax doctor` detects every intentionally broken fixture.

### Identity

- [x] Anonymous submission requires no identity input.
- [x] Email-only remembers an opaque server-resolved identity.
- [x] Email-only is explicitly unverified.
- [x] Signed handoff validates all security claims.
- [x] Public APIs never expose private email.
- [x] Roles cannot be self-asserted.

### Product loop

- [x] Visitors browse, search, filter, and view details.
- [x] Visitors receive duplicate suggestions before submission.
- [x] Configured identities can submit, vote, and comment.
- [x] Roadmap and changelog render from Notion.
- [x] Shipped feedback links to a changelog entry.
- [x] Empty, unavailable, unauthorized, and rate-limited states differ.

### UI

- [x] shadcn `components.json` is valid.
- [x] Standard shadcn component addition works.
- [x] Default plus two alternate preset smoke builds pass.
- [x] Light/dark modes meet contrast requirements.
- [x] Accessibility tests and the recorded keyboard review pass.
- [x] Mobile and desktop layouts pass the recorded responsive review.

### Architecture and quality

- [x] Type checking, lint, format check, unit, contract, integration, and E2E tests pass.
- [x] Package dependency rules and circular checks pass.
- [x] Every success and public error round-trips through Effect Schema and both TanStack transport adapters correctly.
- [x] Server functions enforce same-origin/CSRF and endpoint-level authorization.
- [x] Public server-route GET responses use explicit HTTP cache semantics without mixing viewer state.
- [x] SSR does not self-fetch and client bundles contain no server provider code.
- [x] Long-lived Effect layers are composed once per process/isolate rather than once per request.
- [x] External calls have timeout, cancellation, and classified failure behavior.
- [x] Mutations use correct idempotency/retry behavior.
- [x] Performance budgets pass or approved exceptions are documented.

### Deployment and security

- [x] Cloudflare build and smoke test pass.
- [x] Vercel build and smoke test pass.
- [x] Node/Docker build and smoke test pass.
- [x] Secret bundle checks pass.
- [x] Cookie, origin, rate-limit, redirect, and handoff security tests pass.
- [x] Security documentation includes known limitations.

### Adoption

- [x] Feedbax dogfoods a project generated through the packed public CLI path.
- [x] A non-maintainer completes the documented setup without the maintainer controlling the keyboard.
- [x] Setup time and friction are recorded.
- [x] Release notes distinguish shipped features from future extensions.

## 19. Risks and mitigations

| Risk                                                | Mitigation                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Effect learning curve slows contributors            | Keep domain names direct, provide service templates, examples, and test helpers; do not expose advanced abstractions unnecessarily    |
| TanStack or Effect integration changes              | Pin compatible versions, keep operations transport neutral, isolate adapters, and prove all deployment targets early                  |
| shadcn preset output changes over time              | Pin the tested generator integration and record preset/version in project metadata                                                    |
| Generator combinations multiply rapidly             | Support a small compatibility matrix and reject untested combinations                                                                 |
| Notion cannot provide strong interaction guarantees | Declare capabilities honestly and offer SQL interaction storage for stronger modes                                                    |
| Email-only is mistaken for authentication           | Name it email capture, label it unverified, and document impersonation limits                                                         |
| One large PR becomes unreviewable                   | Use checkpoint commits, keep the draft open, and require checkpoint gates before proceeding                                           |
| Existing useful behavior is lost                    | Maintain a port/delete inventory and run old fixtures against new contracts where valuable                                            |
| Cross-runtime behavior diverges                     | Share core layers and run cookie/server-function/server-route smoke tests on every target                                             |
| CLI damages customized projects                     | Restrict ownership to `feedbax.jsonc` and generated wiring, preview changes, back up/rollback, never rewrite arbitrary product config |

## 20. Port-or-delete inventory

Before removing the existing implementation, classify every current area:

| Current area                              | Default action                                               |
| ----------------------------------------- | ------------------------------------------------------------ |
| Domain schemas and branded IDs            | Port behavior to Effect Schema, then delete Zod duplicate    |
| Cache policy/tests                        | Port proven public/private behavior                          |
| Mutation protection                       | Port security behavior into shared transport middleware      |
| Signed handoff implementation/tests       | Port and strengthen                                          |
| Notion reads/writes/runtime               | Adapt behind new SDK                                         |
| Notion doctor/provisioning/smoke fixtures | Port                                                         |
| Connector testkit                         | Port and expand                                              |
| Portal feature components                 | Rebuild with shadcn; port only behavior/tests                |
| Portal route handlers                     | Replace with thin server-function/server-route adapters      |
| TanStack collections                      | Retain only if the rebuilt vertical slice proves clear value |
| Deployment presets                        | Rebuild and verify against new runtime                       |
| Docs content                              | Rewrite to generated-project experience                      |
| Mock connector                            | Replace with shared in-memory test layer/playground fixtures |

The PR description must link to a completed inventory with each item marked `ported`, `replaced`, or `deleted intentionally`.

## 21. First launch default

The recommended default generated stack is:

```text
Framework:          TanStack Start
Application model: Effect services + TanStack transports
Workspace:          pnpm + Turborepo
UI:                 shadcn monorepo with default Feedbax preset
Connector:          Notion
Interaction store:  Notion
Identity:           Email-only capture with signed cookie
Deployment:         Cloudflare (interactive user may choose another verified target)
Features:           Feedback, votes, comments, roadmap, changelog
```

The zero-prompt command must use these defaults and print the limitations of unverified email and Notion-backed interaction consistency.

## 22. Immediate next actions

1. Review and approve or amend the fixed decisions in sections 3, 4, 5, and 7.
2. Secure the intended npm names/scope and record ownership in the private release checklist.
3. Open the draft PR and paste the checkpoint list into its description.
4. Record the current build/test/bundle baseline.
5. Create the preservation tag/branch.
6. Produce the clean Better-T-Stack-style TanStack/shadcn scaffold in a temporary directory.
7. Verify shadcn monorepo component addition and two preset variants.
8. Commit Checkpoint 1 only after clean-clone CI passes.
9. Implement a single in-memory vertical slice through a TanStack server function and server route before porting Notion or portal features.
10. Continue through checkpoints without expanding launch scope.
