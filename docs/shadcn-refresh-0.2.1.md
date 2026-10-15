# shadcn refresh for 0.2.1

Refreshed all 35 installed shared registry components on 2026-10-15 with `shadcn@latest`, resolved CLI version **4.21.5**, using the existing Base UI Lyra preset. Updated Base UI to 1.9.0 and `@shadcn/react` to 0.3.1. Added no unrelated registry components. Existing Skeleton, Spinner, Kbd, Dialog, and Command components cover the loading/search redesign.

The reviewed adaptations retain workspace `cn` imports, mobile control sizing, explicit non-submitting secondary actions, and the supported neutral/Geist theme. The registry's `cn` package import is adapted to Feedbax's existing local utility. Command uses the registry's cmdk foundation with a simpler search field and accessible dialog title placement.

Installed `@shadcn/lint@0.2.1` and registered its plugin in the existing root ESLint configuration. Generated applications receive the same plugin dependency and configuration. Run `pnpm lint` as before. No new design-system rule policies are enabled by setup; rules can be configured in `eslint.config.mjs` after selecting the desired component contracts.

References: [current CLI](https://ui.shadcn.com/docs/cli), [Command](https://ui.shadcn.com/docs/components/base/command), [lint setup](https://github.com/shadcn-ui/lint/blob/main/SETUP.md), and [lint rules](https://github.com/shadcn-ui/lint#rules).
