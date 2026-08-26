---
status: accepted
---

# Use current shadcn components without pinning the CLI

Feedbax installs and refreshes shared UI components individually with `pnpm dlx shadcn@latest add <component> -c apps/portal`. The generator is always invoked through the current `latest` distribution tag instead of a version-pinned repository command. The shared UI package also declares `shadcn` as `latest` because its global stylesheet imports `shadcn/tailwind.css`; this dependency provides maintained CSS rather than a pinned CLI policy. The resolved CLI version is recorded with each refresh for auditability, while the generated source remains reviewable in version control.

The configured Base UI Lyra preset continues to establish the product's neutral tokens, Geist typography, Lucide icons, and square geometry. Refreshes preserve supported theme and font tokens and make only the adaptations required by Feedbax's monorepo aliases, configured style, and quality gates. A full preset is not reapplied over an established Installation.

When shadcn provides a component, Feedbax uses that component instead of maintaining a parallel generic primitive. Shared shadcn components live in `packages/ui`; only Feedbax-specific compositions with no registry equivalent live in `apps/portal`. Forms use the current shadcn TanStack Form composition with TanStack Form state, Zod validation, and shadcn Field and control components.

This supersedes ADR-0015. It trades byte-for-byte generator reproducibility for a maintained component baseline that Deployers can refresh without first reproducing an obsolete CLI. Reviewed generated diffs, the recorded resolved version, automated tests, typechecking, linting, and builds provide the safety boundary.
