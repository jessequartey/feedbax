# Feedbax site

The Feedbax marketing and documentation application is independent from the product portal. It uses TanStack Start, Fumadocs MDX, and static prerendering.

```sh
pnpm --filter @feedbax/site dev
pnpm --filter @feedbax/site build
```

The production build writes static assets and prerendered HTML to `.output/public`. Deploy that directory to any static host or CDN. Configure an SPA fallback to `_shell.html` (or copy it to the host's expected fallback path) for unknown client-side routes.

Set `VITE_SITE_URL` during the build to emit an absolute canonical URL. The variable is optional; the build has no portal, Notion, or server-secret dependency.

Deploy the verified output to the `feedbax-docs` Worker with `pnpm deploy:cloudflare`, then run `pnpm smoke -- https://feedbax-docs.jessefquartey.workers.dev`.
