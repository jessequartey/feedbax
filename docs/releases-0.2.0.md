# Releasing Feedbax

Core uses Changesets and a fixed version group for `feedbax` and `create-feedbax`. Each change to a published package should include a changeset describing its user-visible effect.

1. Run `pnpm changeset` on the working branch and select the appropriate semantic-version change.
2. Open a pull request. Required CI checks formatting, linting, types, tests, production builds, deployment dry runs, secret scanning, template synchronization, JavaScript budgets, and a clean installation of the packed packages.
3. Merge the pull request after CI passes and conversations are resolved. The Release workflow creates or updates a version pull request containing version numbers, changelogs, and the synchronized template.
4. Merge that version pull request. Release runs the same quality gates, publishes unpublished package versions using npm OIDC trusted publishing, and creates a GitHub release and version tag.

Both npm packages trust only `jessequartey/feedbax` and `.github/workflows/release.yml`. No npm publishing token is stored in GitHub. The workflow uses GitHub-hosted runners with `id-token: write`; the `repository` fields match the public repository so npm provenance is generated.

Publishing checks the registry first, so rerunning after one package succeeds retries only the unpublished package. A network or authentication error is not interpreted as an absent version. Published versions and release tags are never overwritten. An exceptional repair uses a new patch version.

`main` requires the Verify Core check and resolved review conversations. Direct administrator pushes, force pushes, and branch deletion are blocked. GitHub Actions may create the version pull requests; another approving maintainer is not required while this remains a single-maintainer project.

Cloudflare deployments remain separate from npm release automation. Run the documented deployment commands after validating the target account and Worker. Official custom domains are intentionally deferred until the owner attaches them.
