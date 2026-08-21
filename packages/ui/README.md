# Shared UI

This package owns registry primitives shared by Feedbax applications. Product-specific compositions remain in their application package.

The development baseline is shadcn `4.18.0` preset `buFyyzw`: Base UI Lyra, neutral tokens and charts, Geist typography, Lucide icons, and Lyra's native square geometry. Apply a full preset only while generating a fresh installation; update established installations through reviewed component or theme changes.

Run the generator from a consuming application so it can detect the framework while routing registry primitives through the shared aliases:

```sh
pnpm dlx shadcn@4.18.0 add <component> -c apps/portal
```
