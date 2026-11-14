# Contributing

Thanks for helping. Bug reports and pull requests are welcome.

## Setup

Node 24 and npm.

```sh
npm ci
cp .dev.vars.example .dev.vars   # placeholders only; use your own test values
npm run dev                      # http://localhost:3000
```

The repo uses [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests and builds. Don't add ESLint, Prettier or another test runner.

## Before you open a PR

```sh
npm run check
npm run typecheck
npm test
npm run build
```

If you changed anything under `registry/`, run `npm run registry:build` and commit `public/r/`. CI fails on a diff.

## Guidelines

- Keep changes small and focused.
- Files in `src/components/ui/` come from shadcn. Don't edit them by hand.
- Never commit secrets. Test secrets live in `tests/fixtures` only.
- Use `fetch` and Web Crypto. Avoid new dependencies unless needed.

## Releasing

See "Releasing" in the [README](README.md#releasing). Maintainers only.
