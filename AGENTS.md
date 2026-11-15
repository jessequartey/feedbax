# Agent guide

Instructions for coding agents (and humans) working on Feedbax. Read this before you change anything. [CONTRIBUTING.md](CONTRIBUTING.md) covers local setup, and the [README](README.md) is the user guide.

## What Feedbax is

A self-hosted feedback portal: people post ideas and bugs, vote and comment; the owner triages in **Notion**; posts can become **GitHub issues**; shipped work lands in a **changelog**.

- Runtime: TanStack Start (React 19, TanStack Router) on **Cloudflare Workers**, with **D1** (Drizzle), **Queues** (sync), **R2** (images) and a 5-minute **cron**.
- Notion is the admin backend. D1 is the source of truth; `src/sync/` mirrors posts to Notion and polls status back. GitHub sync opens exactly one issue per approved post and moves the post to Done when the issue closes.
- Packages: `packages/create-feedbax` (setup CLI) and `packages/feedbax` (`npx feedbax migrate|add|doctor|deploy|admin`).

## Map

| Area                                   | Where                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Routes (portal, admin, API)            | `src/routes/` (`_portal.*`, `api/`)                                          |
| Server logic                           | `src/server/` (posts, votes, comments, admin, settings, changelog, webhooks) |
| Sync (Notion, GitHub, queue, cron)     | `src/sync/` and `src/integrations/`                                          |
| Email (Resend)                         | `src/email/`                                                                 |
| Markdown (the one shared renderer)     | `src/lib/markdown.ts`                                                        |
| Contracts, config, queue message types | `src/contracts/`                                                             |
| DB schema and migrations               | `src/db/`, `migrations/`                                                     |
| UI                                     | `src/components/` (`ui/` is shadcn-generated)                                |
| Notion template as data                | `src/integrations/notion-template.ts`                                        |

## Commands

```sh
npm ci && npm ci --prefix packages/create-feedbax   # once
npm run check && npm run typecheck && npm test        # every change
npm run build && npm run verify:build
node scripts/test-worker-entry.ts && node scripts/test-worker-sync.ts
npm run cli:build && npm run test:package             # CLI, template or packages/ touched
npm run registry:build                                # registry/ touched; commit public/r/
```

All of them must pass before you open a PR. CI runs the same set.

## Rules

1. **Small and calm.** Do what the issue asks. No drive-by features, no new setup steps for first-time users. Copy a first-time user can follow.
2. **Upstream first.** Before writing infrastructure, check for a maintained library and use it. If one almost fits, prefer a PR upstream and consume it (example: add a Jev adapter to TanStack AI rather than vendoring one). Shift maintenance to the project that owns the problem.
3. **Adapters at the edges.** External services (AI, moderation, email, mailing lists, chat, trackers, deploy targets) go behind a small interface with one module per provider. Core code never imports a vendor SDK directly.
4. **Cheap and fast by default.** It must run well on Cloudflare's Free plan. Count D1 statements per request and avoid N+1s. Do external I/O in the queue consumer, never in the request or cron path. Keep admin-only code out of public bundles. Cache public reads. Any new background work states its cost per idle tick.
5. **Web platform first.** Use `fetch` and Web Crypto. Add a dependency only when it removes real code or risk.
6. **UI.** Use shadcn components only (`npx shadcn add …`; never hand-edit `src/components/ui/`). Match the dark, calm, minimal look. Check light and dark, mobile width, keyboard use, and empty, loading and error states.
7. **Security.** Every admin route and API checks admin identity on the server. Escape all user text and render it through `src/lib/markdown.ts`. Webhook targets go through `src/lib/webhook-url.ts` (SSRF guard). Never log or commit secrets; tests use obviously fake credentials.
8. **Tests.** Vitest runs with `isolate: false`: restore every stub (`vi.unstubAllGlobals`, restore `fetch`) and call `resetEnv()` after writing settings rows. Cover the risky path you changed, and keep the suite fast.
9. **Notion schema.** Sync needs the 13 properties in `src/integrations/notion-schema.ts`. Extra properties are fine; never rename or retype required ones. Template changes go in `notion-template.ts` with tests.
10. **TanStack Router, not Next.js.** For "modal and full page on one URL" use route masking, not parallel or intercepting routes.
11. **Additive migrations only.** A 0.3.x project must upgrade with `npx feedbax migrate` and lose nothing. Name files `migrations/NNNN_<slug>.sql` with the next free number on `origin/main`, and renumber yours if a merge takes it.

## Ways to hurt yourself

1. **Touching production.** Never run `wrangler` against a remote account, `wrangler secret put`, `npm publish`, or edit the owner's live Notion board, Cloudflare dashboard or GitHub settings unless the task says so. Use `.dev.vars` with fake values locally.
2. **Leaking hidden content.** Anything that leaves the Worker (RSS, Open Graph images, webhooks, email, Notion, GitHub, search, media) must respect hidden, spam, merged and draft state. Check `src/server/visibility.ts`.
3. **Breaking old projects.** Generated projects pin a version and upgrade later. A new binding, setting or Notion property needs a fallback for projects that don't have it yet.

## Hit every surface

The most common defect is a change that works where you tested it and is missing everywhere else. Before calling work done, say which of these applied:

- **Portal and admin.** A user-facing action usually needs its admin view, and the reverse (hide needs unhide, ban needs unban).
- **Sync.** Does Notion need the field? GitHub? Does the change survive a Notion poll overwriting it?
- **Notifications.** Should email or a webhook event fire? Exactly once?
- **CLIs.** Does `create-feedbax` set it up for new projects and `feedbax migrate` / `add` / `doctor` handle existing ones?
- **Feedback dialog.** Does the shadcn registry block (`registry/`) need it?
- **Docs.** Does a README section become wrong? Fix it in the same PR.

## Docs and plans

- The README is the user guide. Lead with actions: numbered steps and commands, one line each. Put background on a linked page, not in the steps.
- Don't document what the code already says. A short comment explains a constraint the code can't show; nothing else.
- Don't commit plans, research notes, agent scratch files or PR screenshots. Keep them outside the repo. The merged PR is the record.

## Workflow

- **Pick work by score.** The backlog lives as posts on the live demo portal (https://feedbax.juutech.africa), mirrored to the owner's Notion board with linked GitHub issues in `jessequartey/feedbax`. The owner scores posts (votes, and the admin `Priority` from 0.3.2). Take the highest-scored open issue that isn't blocked. A new idea gets a post first.
- **One branch and one PR per change**, off `main`: `feat/…`, `fix/…`, `docs/…`, `perf/…`. Never push to `main`.
- **Commits**: conventional prefixes (`feat:`, `fix:`, `perf:`, `docs:`, `test:`, `ci:`), imperative, one logical change each. Agent-written commits end with a `Co-Authored-By:` trailer naming the model.
- **PR body**: follow `.github/pull_request_template.md`: problem, change, the checks you ran with results, screenshots for UI (light and dark), `Closes #N`, and the model and harness that wrote it. Any model is welcome; see [CONTRIBUTING.md](CONTRIBUTING.md#ai-assisted-contributions). Closing the issue moves the post to Done through GitHub sync.
- **Reviews**: a second agent or the owner reviews before merge. Address findings in the same PR.
- **Never** deploy, publish to npm, change Cloudflare/Notion/GitHub settings, or touch secrets unless the issue explicitly says so.

## Who does what (multi-agent setups)

When an orchestrator splits work: UI-heavy changes go to a UI-strong model, logic and review go to a strong coding model, and browser tasks (Notion, GitHub, Cloudflare dashboards) go to a browser-capable model in the integrated browser. Each child works in its own worktree and branch and reports: branch, head SHA, checks with results, decisions, and follow-ups.
