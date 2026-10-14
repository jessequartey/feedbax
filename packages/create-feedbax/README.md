# create-feedbax

Create a self-hosted feedback portal backed by Notion and deployed on Cloudflare Workers.

```sh
npx create-feedbax@latest my-feedback
```

The guided setup collects product details, a hidden Notion integration token, optional capabilities, and optional Turnstile protection. It previews Notion changes, generates a flat application with locally owned source, installs dependencies, runs diagnostics, and offers deployment. Public identifiers are in `src/feedbax.ts`; secrets stay in ignored `.dev.vars` and Cloudflare's encrypted secret store.

Run `npx create-feedbax --help` for options. `--template-only` copies source without connecting to services.

Documentation: https://feedbax.dev/docs. Core is Apache-2.0.
