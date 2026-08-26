# Feedbax Core

Feedbax Core is the open-source, self-hostable Feedbax application. Its initial workspace was generated once from the pinned Better-T-Stack foundation recorded in `bts.jsonc`; Better-T-Stack is not a runtime dependency.

## Best-effort voting

In the Notion-only Profile, Votes are browser-remembered convenience state backed by an absolute `Vote Count` Number property in Notion. They are not verified one-person-one-vote records: clearing browser storage, retries, and concurrent writes from separate Worker instances can cause duplicate or drifting counts. One Worker instance serializes changes per Post, but Notion provides no atomic increment across instances.

When Turnstile is configured, the first participation action issues a signed Participation Pass valid for 30 minutes. Confirmed Participant Comments receive a browser-held Comment Capability valid for 15 minutes. Setup stores the shared signing secret outside typed public configuration; rotating `PARTICIPATION_SIGNING_SECRET` invalidates all outstanding Participation Passes and Comment Capabilities.

Feed ordering is deterministic: Top uses Vote Count descending with Created At descending as its tie-breaker, Trending temporarily aliases that exact ordering, and New uses Created At descending. Opaque cursors are scoped to the selected ordering. A timed-out or retried Vote cannot determine whether another Worker instance completed the same write, so Participants should check the confirmed count before retrying.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/portal/components.json`

### Add more shared components

Run the current generator from the project root through the portal workspace. Add or refresh components individually so each generated-source diff can be reviewed. The CLI detects TanStack Start there and follows the configured aliases into the shared UI package:

```bash
pnpm dlx shadcn@latest add <component> -c apps/portal
```

Do not pin the shadcn CLI or its package version. The shared UI package follows the `latest` distribution tag because its global styles import `shadcn/tailwind.css`. If shadcn provides a component, use its current registry source instead of creating a parallel generic primitive.

Import shared components like this:

```tsx
import { Button } from "@feedbax/ui/components/button";
```

### Add app-specific blocks

Keep app-specific blocks and Feedbax-specific compositions with no shadcn equivalent in `apps/portal`; keep reusable shadcn components in `packages/ui`.

## Project Structure

```
feedbax/
├── apps/
│   └── portal/      # Fullstack application (React + TanStack Start)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:portal`: Start only the portal application
- `pnpm run type-check`: Check TypeScript types across all workspaces
- `pnpm run deploy:dry-run`: Build the portal and verify its Worker bundle

## Manual production proof

Before the setup and deployment workflow is extracted into the lifecycle CLI,
run the guided Notion and Cloudflare proof:

```bash
./scripts/prove-manual-production.sh
```

The repeatable checklist, security boundaries, recovery steps, and deferred
custom-domain procedure are in
[the manual production proof runbook](docs/manual-production-proof.md).

## Project contract

- [Product context](CONTEXT.md)
- [Core specification](SPEC.md)
- [Public roadmap](ROADMAP.md)
- [Testing contract](TESTING.md)
- [Architecture decisions](docs/adr/)
- [Contributing](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md)
- [Community code of conduct](CODE_OF_CONDUCT.md)

## License

Feedbax Core is licensed under [Apache-2.0](LICENSE).
