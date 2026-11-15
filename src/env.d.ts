// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them. They live in
// `.dev.vars` locally and in Workers secrets in production. PORTAL_URL and the bindings
// (DB, IMAGES, SYNC_QUEUE, NOTIFY_QUEUE) come from worker-configuration.d.ts (`npm run cf-typegen`).
// If you regenerate that file with a populated .dev.vars and get duplicate-property
// errors, delete the matching line below.
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    FEEDBAX_HOST_SECRET: string;
    NOTION_TOKEN: string;
    GITHUB_TOKEN?: string;
    GITHUB_WEBHOOK_SECRET?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    /** Email notifications (`npx feedbax add email`); email is off without it. */
    RESEND_API_KEY?: string;
    /** Optional AI provider key (`npx feedbax add ai`); local mode works without it. */
    AI_API_KEY?: string;
  }
}
