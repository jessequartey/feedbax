# Feedbax Core

Feedbax Core is an open-source feedback portal backed by Notion and deployed on Cloudflare Workers. Product Teams manage feedback, Comments, Roadmap, and Changelog in Notion.

## Next release: 0.2.1

The optional [Connected Profile](docs/connected-profile.md) adds signed identity handoff from your application, D1 operational state, unique voting per verified Participant, and verified Comment attribution. This is development-branch scope; the published installation command below remains 0.2.0 until release.

## Install 0.2.0

Use Node.js 22.14 or newer and pnpm 10:

```sh
npx create-feedbax@0.2.0 my-feedback
```

Guided setup creates the Notion schema, copies an application you own, installs dependencies, checks configuration, and offers deployment. It collects secrets privately and stores public configuration in `src/feedbax.ts`.

From the generated application, run `pnpm exec feedbax doctor` to check readiness, `pnpm exec feedbax deploy --dry-run` to verify the Worker bundle, or `pnpm exec feedbax deploy` to publish it. See the [setup guide](https://feedbax-docs.jessefquartey.workers.dev/docs) and [release process](docs/releases-0.2.0.md).

### Replacing 0.1

Version 0.2.0 requires a fresh Installation. Create a new project directory, Notion Database, and Worker; setup does not import or mutate legacy content. Keep the existing 0.1 Installation and content read-only while checking the new portal, then change your public links or domain when ready. Archive legacy content manually only after deciding what to retain.

## Best-effort voting

In the Notion-only Profile, Votes are browser-remembered convenience state backed by an absolute `Vote Count` Number property in Notion. They are not verified one-person-one-vote records: clearing browser storage, retries, and concurrent writes from separate Worker instances can cause duplicate or drifting counts. One Worker instance serializes changes per Post, but Notion provides no atomic increment across instances.

When Turnstile is configured, the first participation action issues a signed Participation Pass valid for 30 minutes. Confirmed Participant Comments receive a browser-held Comment Capability valid for 15 minutes. Setup stores the shared signing secret outside typed public configuration; rotating `PARTICIPATION_SIGNING_SECRET` invalidates all outstanding Participation Passes and Comment Capabilities.

Feed ordering is deterministic: Top uses Vote Count descending with Created At descending as its tie-breaker, legacy Trending URLs resolve to Top, and New uses Created At descending. Opaque cursors are scoped to the selected ordering. A timed-out or retried Vote cannot determine whether another Worker instance completed the same write, so Participants should check the confirmed count before retrying.

Public portal Posts and Comments use an unverified Device Profile. A display name and syntactically valid email are required to create a Post, Comment, or reply, but this does not verify email ownership; email remains private. Resolved Comments are hidden. Changelog images are managed directly in Notion and temporary file references are discarded or refreshed before expiry. See [Notion-native participation guarantees](docs/notion-native-participation.md) for later enablement, rotation, recovery, and API boundaries.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Turborepo** - Optimized monorepo build system

## Contributing locally

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

## Feedback registry block

Install the framework-neutral copied-source block from the 0.2.0 tag:

```sh
pnpm dlx shadcn@latest add jessequartey/feedbax/feedbax-feedback#v0.2.0
```

`FeedbaxFeedback` accepts an `onSubmit` callback and an optional `findSimilar` callback. Configure `createFeedbaxClient` only in server code using `FEEDBAX_API_BASE_URL` and `FEEDBAX_API_SECRET`, then expose submission through the host application's own server function or route. Never pass the secret to the browser or import `feedbax-client.server.ts` from a client module.

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

For low-level Notion and Cloudflare diagnostics outside guided setup, run:

```bash
./scripts/prove-manual-production.sh
```

Use [version 0.2.0 acceptance](docs/version-0.2.0-acceptance.md) for the repeatable capability matrix, security boundaries, and dedicated Workspace checks.

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
