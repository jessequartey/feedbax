# Deployment presets

Contains build presets for Cloudflare Workers, Vercel, and Node/Docker. Root builds verify provider output; live provisioning and credentials are intentionally out of scope.

Build the Docker image from the repository root with `docker build -f deploy/docker/Dockerfile -t feedbax:local .`.
