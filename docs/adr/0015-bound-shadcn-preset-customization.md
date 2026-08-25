---
status: superseded by ADR-0017
---

# Bound shadcn preset customization

Feedbax applies shadcn `4.18.0` preset `buFyyzw` only while generating a new installation, before its component source is customized. This establishes the Base UI Lyra style, neutral tokens and charts, Geist typography, Lucide icons, and Lyra's native square geometry.

Existing installations may change supported theme and font tokens or adopt reviewed component diffs, but must not reapply the full preset because shadcn deliberately overwrites installed components and may disturb monorepo configuration. Shared registry primitives remain in `packages/ui`; Feedbax-specific compositions remain owned by `apps/portal`.
