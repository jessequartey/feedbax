# shadcn refresh for 0.2.1

Refreshed all 35 installed shared registry components on 2026-10-15 with `shadcn@latest`, resolved CLI version **4.21.5**, using the existing Base UI Lyra preset. Updated Base UI to 1.9.0 and `@shadcn/react` to 0.3.1. Added no unrelated registry components. Existing Skeleton, Spinner, Kbd, Dialog, and Command components cover the loading/search redesign.

The reviewed adaptations retain workspace `cn` imports, mobile control sizing, explicit non-submitting secondary actions, and the supported neutral/Geist theme. The registry's `cn` package import is adapted to Feedbax's existing local utility. Command uses the registry's cmdk foundation with a simpler search field and accessible dialog title placement.

Installed `@shadcn/lint@0.2.1` in the existing root ESLint configuration. Following the owner’s request to make shadcn usage better, `pnpm lint` now enforces three checks as errors on JSX/TSX: `no-raw-colors`, `no-unknown-classes`, and `require-static-classes`. CI already runs that command. A negative fixture confirms that all three rules reject invalid usage, while a themed Button using its size prop passes.

Each app’s `components.json` names its actual CSS entry, which imports the shared theme and includes app-specific classes. Generated applications use a real relative CSS import so the linter and Tailwind can resolve the same theme without relying on Vite aliases. The clean generated-installation check runs the same lint rules.

Static class forwarding remains allowed inside owned shared primitives. The only unknown-class exceptions are Cloudflare’s `cf-turnstile` discovery marker and the upstream Sonner wrapper’s `toaster` marker. Unused classes were removed, the docs brand now uses its existing stylesheet class, the feedback block success text uses a theme token, and Comment pagination uses the shared Button.

`no-restyle`, `no-arbitrary-values`, and `no-inline-styles` remain opt-in: the current primitives use CSS-variable geometry, and portal compositions have reviewed custom layouts. Add component contracts in `eslint.config.mjs` before turning those policies on. The CLI transitively includes an older `cn`; if the linter encounters it, it reports that it is using its bundled 0.4.0 grammar. Feedbax’s application class helper remains `clsx` plus `tailwind-merge`.

Post detail loading now opens the dialog shell immediately, uses the same two-column layout as the completed Post, and shows the Post without waiting for Comments. Comments load separately with retry, and their composer/profile row appears above an independently scrollable thread list. The redundant full-page toolbar was removed.

References: [current CLI](https://ui.shadcn.com/docs/cli), [Command](https://ui.shadcn.com/docs/components/base/command), [lint setup](https://github.com/shadcn-ui/lint/blob/main/SETUP.md), and [lint rules](https://github.com/shadcn-ui/lint#rules).
