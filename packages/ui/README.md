# Shared UI

This package owns current shadcn components shared by Feedbax applications. Feedbax-specific compositions with no shadcn equivalent remain in their application package.

The configured preset is Base UI Lyra with neutral tokens and charts, Geist typography, Lucide icons, and Lyra's square geometry. Do not reapply a full preset over an established Installation. Add or refresh one component at a time from the current registry and review the generated-source diff.

Run the generator from a consuming application so it can detect the framework while routing registry primitives through the shared aliases:

```sh
pnpm dlx shadcn@latest add <component> -c apps/portal
```

The `shadcn` package follows the `latest` distribution tag because `globals.css` imports its maintained Tailwind stylesheet. Invoke the generator through `pnpm dlx shadcn@latest` and record the version resolved during a refresh for auditability, not as a command pin.

The primitives are shared by both Content Providers and private Connected views. Keep identity and provider access in the application/domain modules rather than adding authorization to a visual component. Generated Installations receive owned copies under `src/components/ui`; see the [integration overview](../../README.md#integrate-your-product).
