# feedbax

The local lifecycle CLI for a generated Feedbax feedback portal.

```sh
pnpm exec feedbax doctor
pnpm exec feedbax deploy --dry-run
pnpm exec feedbax deploy
pnpm exec feedbax rotate-api-key
pnpm exec feedbax info
```

Create a new Installation with `npx create-feedbax@latest`. `doctor` validates the typed configuration, read-only Notion access, required secrets, and build. `deploy` previews the target and uploads allowlisted secrets after confirmation. `--dry-run` does not deploy. Never expose the trusted submission API key in browser code.

Documentation: https://feedbax.dev/docs. Core is Apache-2.0.
