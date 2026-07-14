# Scaffold reference

Feedbax uses Better-T-Stack as a one-time structural reference, not an installation-time dependency.

- Tool: `create-better-t-stack@3.36.3`
- shadcn compatibility pin: `shadcn@4.13.0`
- Result: verified disposable TanStack Start, pnpm, Turborepo, and shared shadcn UI workspace.

```sh
npx --yes create-better-t-stack@3.36.3 feedbax-bts-reference \
  --frontend tanstack-start --backend self --runtime none --api none \
  --database none --orm none --auth none --addons turborepo \
  --examples none --package-manager pnpm --web-deploy none \
  --server-deploy none --no-git --no-install --directory-conflict error
```

The generated reference was inspected in `/tmp` and is not copied wholesale. Feedbax owns its workspace, template, dependencies, and lockfile.
