# Deployment presets

Contains verified presets for Cloudflare Workers, Vercel, and Node/Docker. The portal runtime spike exercises SSR, server functions, server-only environment variables, secure cookies, cacheable responses, mutations, and sanitized errors. Notion is validated before deployment with `pnpm notion:doctor` rather than through a public endpoint.

Build the Docker image from the repository root with `docker build -f deploy/docker/Dockerfile -t feedbax:local .`.

## Runtime spike

Configure `FEEDBAX_SPIKE_MARKER` in each runtime. Run `pnpm notion:doctor` in a secret-bearing predeploy job with `NOTION_TOKEN` and `NOTION_DATA_SOURCE_ID`; secrets must not use a `VITE_` prefix. Then run the shared black-box check with `pnpm --filter @feedbax/portal smoke -- https://deployment.example`.

| Concern             | Cloudflare Workers                         | Vercel                                                                              | Node/Docker                                                      |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Runtime             | workerd via Cloudflare Vite plugin         | Node function via Nitro                                                             | Node 22 Nitro server                                             |
| Environment         | Worker bindings exposed to server runtime  | Project environment variables                                                       | Container environment variables                                  |
| Secure cookie       | Sent over deployed HTTPS                   | Sent over deployed HTTPS                                                            | Header is testable locally; browsers retain it only over HTTPS   |
| Shared-cache policy | `s-maxage` remains visible in the response | Vercel consumes `s-maxage` for its CDN and strips it from the browser-facing header | Headers emitted; an upstream proxy must implement shared caching |
| Output              | Worker bundle                              | `.vercel/output`                                                                    | `.output` copied into the image                                  |
| Logs/cold starts    | Worker logs; isolate startup               | Function logs; Node cold starts possible                                            | Container stdout; lifecycle controlled by operator               |

Live evidence is recorded here after deployment. A provider build alone does not count as passing.

| Target     | URL or identifier                                                                           | Runtime                         | Smoke result                      | Date       |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- | ---------- |
| Cloudflare | `https://feedbax-portal.jessefquartey.workers.dev` / `7daeb47c-36c5-43ac-b9f4-e0e20be35d5c` | workerd, 17 ms reported startup | Passed                            | 2026-07-11 |
| Vercel     | `https://portal-tau-two-57.vercel.app` / `dpl_EkvzNoBtpU2Y1SQKNYfej6TiSh8C`                 | Node.js 22 via Nitro            | Passed                            | 2026-07-11 |
| Docker     | image `feedbax-spike:local` / container `54c82966dae2`                                      | Node 22.18.0 Alpine             | Passed at `http://localhost:3001` | 2026-07-11 |

The Cloudflare deployment requires the application-local `wrangler.jsonc` so the Vite plugin emits the Worker server bundle; deploying only the generated client configuration produces an assets-only Worker. Vercel requires a `NITRO_PRESET=vercel` build and consumes `s-maxage` before sending `Cache-Control` to clients. Docker requires `CI=true` during the frozen pnpm install and a root `.dockerignore` to avoid copying host build artifacts.

The shared smoke suite passed SSR HTML, the typed server function loader, environment marker, secure cookie flags, cache/ETag handling, mutation validation/state, expected 400 response, and sanitized 500 response on every target. The separate Notion doctor validates credentials and schema without exposing an HTTP route.
