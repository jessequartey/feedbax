# Feedbax Product Specification

## Status

Accepted implementation contract for the Feedbax Core 0.2.0 replacement. Changes to settled decisions are recorded through public ADRs.

## Product thesis

Feedbax is an open-source, self-hostable public feedback portal for small product teams whose feedback and product-planning workflow already lives in Notion. It gives Participants a branded place to submit feedback and follow public progress without forcing Team Members to adopt a separate management workspace.

Feedbax competes first on Notion-native workflow, ownership, programmability, and straightforward deployment—not on being a generic Featurebase clone or merely being cheaper.

## Objectives

In priority order:

1. Give Product Teams a useful Notion-native feedback portal they can own and self-host.
2. Make the Notion-only Profile straightforward to install, operate, and customize.
3. Earn trust through a complete open-source Core, clear documentation, and production-derived improvements.
4. Establish a dependable foundation for later Connected Profile capabilities.

## Initial audience

The initial adopter is a technical founder working in a 2–10-person SaaS Product Team that already uses Notion for feedback or product planning and can deploy software from a terminal or GitHub.

Each Installation serves one Product Team and one product.

## Capability profiles

### Notion-only Profile

The quick-start profile provides public feedback browsing, submission, and status visibility without a separate operational datastore. A Participant may supply an optional name and contact email, but that identity is unverified. Browser-local data may remember form details for convenience but is not authentication.

This profile does not claim reliable identity, unique voting, comments, following, or notifications.

### Connected Profile

The Connected Profile keeps feedback content and product planning in Notion while adding the operational state required for verified Participant identity, voting, comments, following, notifications, signed identity handoff, abuse prevention, synchronization, and media storage.

The Connected Profile is a capability distinction, not a paid or enterprise tier.

## Version 0.2.0 replacement release

The replacement ships first as `0.2.0-alpha.*` builds of the Notion-only Profile. Final `0.2.0` follows only after the generated portal, CLI, documentation, and replacement guidance are ready. The working proof should reach prospective design partners before work begins on the Connected Profile.

### Included

- Guided command-line setup
- Connection to an internal Notion integration
- Creation or validation of the required Notion schema
- Public feedback list and detail pages
- Anonymous feedback submission with optional unverified name and email
- Public statuses and a simple roadmap
- A REST endpoint for submissions from another SaaS product
- Product name, logo, colors, and basic copy configuration
- Cloudflare deployment
- Documentation for attaching a custom domain
- A `doctor` command that diagnoses broken configuration

### Excluded

- Connected Profile capabilities
- Verified accounts or Better Auth
- Voting, comments, following, and notifications
- Images and video
- A separate management dashboard
- An embeddable React widget
- Vercel and Docker deployment
- A generic storage or plugin system
- Linear, Jira, GitHub, and Slack connectors
- Duplicate detection and AI
- Billing and enterprise features

## Feedback model

Every submission is a **Post** with one of three Post Types:

- **Feature Request:** proposes a capability the product does not currently provide
- **Bug Report:** describes existing behavior that does not work as intended
- **General Feedback:** contains an observation that is neither of the above

Support questions are outside the 0.2.0 product boundary.

A Post moves through this Post Status lifecycle:

1. **New:** received but not yet evaluated
2. **Reviewing:** being investigated or considered
3. **Planned:** accepted for future work
4. **In Progress:** actively being implemented
5. **Shipped:** delivered to Participants
6. **Closed:** not being pursued, invalid, or no longer relevant

The public roadmap displays Planned and In Progress items and includes a completed view of Shipped items.

Publication is independent of status. New portal and API submissions are unpublished by default, and a Team Member publishes an item from Notion. Automatic publication is deferred.

The Notion-only Profile displays all submitters as Anonymous. Optional name and email fields are private follow-up information in Notion, are treated as unverified, and are never exposed through public pages or APIs.

### Browser-held draft editing

After a portal submission, the browser receives and stores a secret Browser Capability while Notion stores only its cryptographic hash. Possession permits the browser to edit the title, description, type, optional name, and optional email, or to withdraw the Post, only while the item remains New and unpublished.

A Browser Capability never permits changes to status, publication, prioritization, tags, or internal fields. It stops granting edit access when a Team Member publishes the item or moves it beyond New. Clearing browser storage loses access permanently; the Notion-only Profile provides no recovery or cross-device access. The interface describes this as editing a draft from the current browser, not as an account or verified ownership.

## Notion data contract

The setup flow creates a dedicated **Feedback Data Source** inside a Notion page selected by the Deployer. A Deployer may skip automatic creation by supplying an existing Feedbax-compatible data source; `doctor` validates compatibility before the application starts. Version 0.2.0 does not map arbitrary schemas.

The Feedback Data Source has this canonical schema:

| Property          | Notion type      | Public output | Purpose                                          |
| ----------------- | ---------------- | ------------: | ------------------------------------------------ |
| `Title`           | Title            |           Yes | Short summary                                    |
| `Description`     | Rich text        |           Yes | Participant-supplied details                     |
| `Type`            | Select           |           Yes | Feature Request, Bug Report, or General Feedback |
| `Status`          | Select           |           Yes | Post Status                                      |
| `Published`       | Checkbox         |            No | Controls public visibility                       |
| `Submitter Name`  | Rich text        |            No | Optional unverified follow-up information        |
| `Submitter Email` | Email            |            No | Optional unverified follow-up information        |
| `Source`          | Select           |            No | Portal, API, or Team                             |
| `External ID`     | Rich text        |            No | API idempotency and external reference           |
| `Edit Token Hash` | Rich text        |            No | Verifies a Browser Capability                    |
| `Created At`      | Created time     |           Yes | Submission time                                  |
| `Updated At`      | Last edited time |           Yes | Most recent change                               |

Public pages and APIs use an explicit allowlist containing only Title, Description, Type, Status, Created At, and Updated At. The public description lives in its dedicated property; Feedbax never renders the page body, so Team Members may use it for private notes without accidentally publishing them.

Product Teams may add custom properties and page-body content. Feedbax ignores unknown properties. Required properties may be renamed when their stable Notion property IDs remain configured. Deleting a required property or changing its type causes `doctor` to report a precise repair instruction.

API submissions require an `Idempotency-Key` header, stored as External ID. Retrying the same key returns the original Post. This is best-effort in the Notion-only Profile because Notion does not provide a transactional uniqueness constraint.

## Technical architecture

Version 0.2.0 is a standalone portal deployed to its own Cloudflare Worker and custom domain. A Product Team's SaaS submits feedback through the portal's HTTP endpoint; installing Feedbax inside an existing application and an embeddable package are deferred.

The Deployer connects an internal Notion integration token with Insert Content access to a selected parent page. Public OAuth and Notion Marketplace distribution are deferred.

Routes and HTTP handlers call a deep **Feedback module** that owns publication rules, status transitions, idempotency, public-field allowlisting, Browser Capability verification, and translation between Notion records and the domain model. Route code does not manipulate Notion properties directly.

The Feedback module uses a storage port with a Notion adapter in production and an in-memory adapter in tests. The interface of the Feedback module is the primary behavioral test surface.

The application uses TypeScript, TanStack Start, Cloudflare's Vite plugin, and the Cloudflare Workers runtime. Public feedback and roadmap pages are server-rendered. Framework versions are pinned because TanStack Start is release-candidate software at the time of this decision, and framework-specific code remains at the route seam.

Version 0.2.0 uses native asynchronous TypeScript, explicit result types, and bounded retry with jitter for external rate limits. Effect is excluded until workflows such as notification delivery or synchronization demonstrate a need for its execution model.

Next.js support is deferred until at least five prospective Product Teams explicitly request it or an outside contributor commits to owning its adapter and parity tests.

## Submission endpoint security

Trusted submissions from a Product Team's SaaS use one strong, scoped API key generated during setup and stored as an encrypted Cloudflare secret. Requests send the key through the `Authorization: Bearer` header and include an `Idempotency-Key`. Feedbax never stores or logs the plaintext key, rate-limits by key identifier, and supports key rotation through the CLI. Multiple keys and HMAC request signing are deferred.

Anonymous portal submissions always use Cloudflare's native rate-limit binding. Turnstile is optional but strongly recommended: the CLI offers its configuration, local development may omit it silently, `doctor` emits a prominent production warning when it is absent, and documentation states that a deployment without it has weaker spam protection. Server-side Siteverify validation is mandatory whenever Turnstile is enabled.

## Public routes and HTTP endpoints

The standalone portal exposes:

- `/` for a unified Post feed with URL-backed search, multi-select Type and Status filters, Trending/Top/New sorting, pinned browser-editable Draft Posts, and explicit append pagination
- `/p/:slug` for canonical Post detail pages; internal storage IDs are never part of public URLs
- `/submit` for Post creation, routed contextually from the feed and complete on direct navigation
- `/roadmap` for a responsive, read-only Planned/In Progress/Shipped board
- `/changelog` for the product-update placeholder

A device-local Participant profile may store a required display name and optional email. It applies privately to future submissions only, is not authentication, and is independent from Browser Capabilities. TanStack Router owns validated URL and loader state; TanStack Query owns cached server state and mutation reconciliation. Public and capability-authorized Draft Post reads use separate cache paths, and authorized reads are private and `no-store`.

- `/submit` for anonymous submission
- `/roadmap` for Planned, In Progress, and Shipped groups
- `/health` for minimal deployment health

The stable Notion page ID is the public `:id`; the title-derived slug is cosmetic and may change without breaking identity.

The stable external HTTP contract initially contains:

- `POST /api/v1/posts` for trusted SaaS submissions using a Bearer key and `Idempotency-Key`
- `PATCH /api/drafts/:id` for Browser Capability draft edits
- `DELETE /api/drafts/:id` for Browser Capability withdrawal

Public form submission and public reads use internal TanStack server functions. Stable public read endpoints are deferred until a widget or real external consumer requires them.

## Public read query

Public lists query 25 Posts at a time with opaque cursor pagination, enforce `Published = true` in the Notion query, and request only public allowlisted properties. The feedback list sorts by Created At descending; roadmap groups by Post Status and sorts within groups by Updated At descending.

Each cache miss performs one Notion query with no per-item follow-up requests. `429` and `529` responses honor `Retry-After` and use bounded exponential backoff with jitter. Configurable sorting and page size are deferred.

The public-read cache requires no KV or D1. TanStack Start routes produce invariant public responses and cache headers; Cloudflare Workers Caching provides the shared edge storage, tiering, request collapsing, stale refresh, and stale-on-error behavior.

Browsers cache public responses for 30 seconds. Cloudflare treats them as fresh for 120 seconds, may serve stale while asynchronously refreshing for 10 minutes, and may serve the last safe public projection during a Notion failure for up to 24 hours. Direct Team Member edits in Notion may therefore take up to two minutes to appear.

Cache keys canonicalize filters, sorting, cursor, page size, and schema version. Only public allowlisted projections are cached; private properties and page bodies never enter a cacheable response. Feedbax writes purge the affected public cache tag or path, while later Notion-webhook support may provide immediate invalidation for direct Notion edits.

## Repository topology

This repository is the canonical public Git repository for Core and replaces the earlier Feedbax implementation while retaining its history. It contains the portal, shared foundations, public product context, specification, ADRs, roadmap, testing contract, contribution guidance, governance, security policy, and code of conduct.

Core is consumed through tagged releases or published packages. It does not depend on private repositories or unpublished filesystem paths.

## Licensing

Core is licensed under Apache-2.0. Contributions are accepted directly under the same license without a CLA or copyright assignment. Core remains complete and meaningfully self-hostable.

## Scaffolding and build order

A pinned Better-T-Stack release is used once to generate a pnpm workspace with TanStack Start, `backend:self`, and shared configuration/UI foundations. Its Alchemy Cloudflare preset, database, authentication, and Effect-based infrastructure are not selected. Feedbax adds Cloudflare's official Vite plugin and Wrangler configuration directly, and Better-T-Stack is not a runtime dependency.

`create-feedbax` provides an interactive experience inspired by Better-T-Stack but does not invoke Better-T-Stack during installation. It generates a versioned Feedbax-owned TanStack Start template with dependency ranges verified for that Feedbax release. Additional application frameworks remain deferred until they satisfy the accepted demand or outside-maintainer threshold.

Version 0.2.0 uses a typed `feedbax.ts` file for product identity, public copy, the shadcn theme preset, Notion connection identifiers, publication/display settings, optional Turnstile configuration, and submission limits. Secrets never appear in this file. A generic plugin interface is deferred until the first real connector exists; runtime connectors will use versioned npm packages, while shadcn registry items are reserved for intentionally copied source and integration recipes.

The initial shadcn preset is applied immediately after scaffolding and before application UI is customized. Later changes use partial theme/font application or reviewed diffs rather than blindly overwriting locally owned component source.

Implementation proceeds in this order:

1. Build one portal manually.
2. Connect it to a real Notion Workspace.
3. Verify submission, moderation, public rendering, Browser Capability editing, and Cloudflare deployment.
4. Turn the proven setup and deployment steps into the CLI.
5. Add the documentation application around the stable workflow.
6. Build the Connected Profile after design-partner learning.
7. Create hosted or proprietary code only after adoption justifies it.

Connector folders are created only when an approved connector has implementation work; empty aspirational packages are excluded.

The documentation application initially deploys on its own Cloudflare subdomain, while the portal and dogfooded demo use another subdomain. A path-based microfrontend router is deferred until same-origin path mounting provides demonstrated value. Once the portal works, the project operates its own public feedback portal backed by its own Notion Workspace.

## CLI contract

Two packages have distinct responsibilities:

- `create-feedbax` bootstraps a new project through `npx create-feedbax`.
- `feedbax` is the generated project's local lifecycle CLI, initially exposing `doctor`, `deploy`, `rotate-api-key`, and `info`.

Normal package scripts run development, tests, and builds. Upgrade, plugin, connector, and migration commands are deferred.

### Creation flow

The interactive creator:

1. Selects a destination directory.
2. Collects product name and public description.
3. Accepts a shadcn preset.
4. Collects the Notion token through a hidden prompt.
5. Selects a parent page or accepts an existing compatible data-source ID.
6. Creates or validates the canonical schema.
7. Configures Turnstile or records an explicit skip.
8. Generates the trusted-submission API key.
9. Creates the versioned TanStack Start application.
10. Writes local secrets to ignored `.dev.vars`.
11. Runs `doctor`.
12. Offers an explicit Cloudflare authentication and deployment step.

The creator previews remote mutations before performing them. It refuses to overwrite a non-empty destination directory.

### Configuration interface

The generated project contains this initial typed interface:

```ts
export default defineFeedbax({
  product: {
    name: "Feedbax",
    description: "Help us build the right product",
  },
  theme: {
    preset: "preset-code",
  },
  notion: {
    databaseId: "...",
    dataSourceId: "...",
    properties: {
      title: "...",
      description: "...",
      type: "...",
      status: "...",
      published: "...",
      submitterName: "...",
      submitterEmail: "...",
      source: "...",
      externalId: "...",
      editTokenHash: "...",
      createdAt: "...",
      updatedAt: "...",
    },
  },
  submissions: {
    moderation: "required",
    maxTitleLength: 160,
    maxDescriptionLength: 5_000,
  },
  turnstile: {
    enabled: false,
    siteKey: undefined,
  },
});
```

Startup validation rejects unknown or invalid keys with actionable messages. `NOTION_TOKEN`, `FEEDBAX_API_KEY_HASH`, and `TURNSTILE_SECRET_KEY` remain encrypted or ignored environment secrets and never appear in `feedbax.ts`.

### Generated-source ownership

The Product Team owns and may customize the generated application source under Apache-2.0. Version 0.2.0 provides no automatic upgrade command; future upgrades use explicit migrations and reviewed diffs rather than overwriting customized source.

### Diagnostics and deployment

`doctor` is read-only. It checks supported Node/pnpm versions, Wrangler configuration, presence of secrets without printing values, Notion capabilities and data access, property IDs and types, allowed Post Status and Type options, Cloudflare bindings, Turnstile configuration, build success, and a read-only Notion query. A future `doctor --fix` may offer individually confirmed repairs.

`deploy` runs `doctor`, displays the target Cloudflare account, project, and hostname, and requests confirmation before invoking Wrangler.

## Quality contract

Implementation uses red-green test-driven slices at three confirmed seams: the Feedback module interface, the Notion adapter's external HTTP boundary, and Worker HTTP handlers.

The initial essential suite proves that:

- A submission becomes a New, unpublished Post with an immutable slug.
- Public output contains only allowlisted fields.
- A Browser Capability edits an unpublished draft but not a published item.
- Trusted submission rejects an invalid API key and honors idempotency.
- Notion mapping is correct and a `429` respects `Retry-After`.
- The production Worker build starts and serves a smoke request.

Pull-request CI runs formatting/linting, type checking, the essential tests, a production build, and `wrangler deploy --dry-run`. Broad UI suites, automated multi-browser tests, and live-Notion CI are deferred; releases receive manual browser and dedicated-workspace Notion smoke checks.

## Releases and contributions

Existing `feedbax@0.1.1` and `create-feedbax@0.1.0` packages are replaced through `0.2.0-alpha.*` prereleases followed by final `0.2.0`. Changesets records releasable changes, and npm trusted publishing with provenance replaces long-lived publishing tokens after each package's one-time bootstrap.

All changes to `main` use pull requests with required CI and resolved conversations; force pushes and branch deletion are blocked. Another approving review becomes mandatory only after a second trusted maintainer exists.

Contributions require no CLA. Issues are reserved for reproducible bugs, while features and architectural proposals begin as discussions. Maintainers favor small bug, reliability, performance, documentation, and maintenance changes; non-trivial work requires prior agreement, and maintainers may close, split, or decline unsolicited scope-expanding work.
