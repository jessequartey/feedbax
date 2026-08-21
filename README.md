# Feedbax Core

Feedbax Core is the open-source, self-hostable Feedbax application. Its initial workspace was generated once from the pinned Better-T-Stack foundation recorded in `bts.jsonc`; Better-T-Stack is not a runtime dependency.

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

Run the pinned generator from the project root through the portal workspace. It detects TanStack Start there and follows the configured aliases into the shared UI package:

```bash
pnpm dlx shadcn@4.18.0 add accordion dialog popover sheet table -c apps/portal
```

Import shared components like this:

```tsx
import { Button } from "@feedbax/ui/components/button";
```

### Add app-specific blocks

Keep app-specific blocks and product compositions in `apps/portal`; move only reusable registry primitives into `packages/ui`.

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
