# Docs application sign-in and Connected acceptance

The docs application is Feedbax's first-party example of a real application identity provider. Better Auth owns its email-link authentication and sessions in a dedicated D1 database. The existing signed handoff adapter reads the authenticated server session and asserts its stable user ID, display name, and verified contact address to the separate feedback portal. This does not add an authentication service to generated Feedbax Installations.

## Configuration

The normal docs build uses `apps/docs/wrangler.jsonc`. The separate acceptance build uses `apps/docs/wrangler.acceptance.jsonc`:

```sh
pnpm --filter @feedbax/docs build:acceptance
cd apps/docs
pnpm exec wrangler deploy
```

The Cloudflare Vite plugin writes the selected deployment configuration; deploy immediately after that build. A subsequent normal build selects the normal docs Worker again. Production acceptance uses these dedicated resources, with no changes to the dogfood portal or its existing Notion content:

- Docs Worker: `feedbax-docs-acceptance` and `DOCS_AUTH_DB` / `feedbax-docs-acceptance`.
- Connected Worker: `feedbax-connected-acceptance` and `FEEDBAX_DB` / `feedbax-connected-acceptance`.
- Private R2 bucket: `feedbax-connected-acceptance-images`.
- A separate Notion parent page titled **Feedbax 0.2.1 production acceptance**, containing its own Feedback and Changelog sources.

Configure the exact HTTPS docs origin in `DOCS_SITE_URL` and the exact Connected origin in `FEEDBAX_PORTAL_ORIGIN`. The portal's issuer is the docs origin and its login URL is that origin plus `/feedbax-login`. Apply `apps/docs/migrations/0001_auth.sql` to `DOCS_AUTH_DB` and every portal migration to `FEEDBAX_DB` before enabling sign-in.

The docs Worker requires encrypted `DOCS_AUTH_SECRET`, `IDENTITY_HANDOFF_SECRET`, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM`. Generate independent random secrets of at least 32 bytes for the first two. Only the handoff secret is shared with the Connected Worker. The Connected Worker uses `EMAIL_PROVIDER_SECRET` for its Resend key. Use a verified Resend sending domain and an explicitly authorized test recipient. Never commit keys, test inbox links, cookies, or session identities. Local copies belong in ignored files with restrictive permissions.

## Sign-in behavior

The portal begins its normal browser-bound handoff. An unauthenticated docs session redirects to `/sign-in`, retaining the validated handoff return path. The shadcn form sends a five-minute email link through Resend. The email uses a fragment token, which the browser removes from its address bar before asking for confirmation; the token is sent to the server only in a same-origin POST body. Email scanners fetching the page cannot consume the link. Better Auth stores the verification identifier as a hash and atomically consumes it once. Its session cookie uses Secure and HttpOnly attributes.

The server exposes only the required sign-in/sign-out operations and a small private session projection containing the display name. Requests and responses are private/no-store. Mutation origins, bounded request bodies, local return paths, and the exact portal callback are checked. Database-backed rate limiting uses Cloudflare's connecting IP. A new link for an existing email retains the same stable application identity. Sign-out revokes the docs session; signing out of Feedbax independently revokes the portal session.

Open the email in the browser that began Feedbax sign-in, then confirm. The portal challenge expires after five minutes; if it expires while reading email, start Feedbax sign-in again. The docs session will already be available. Cookie sessions and email links must never be copied into release evidence. The handoff HTML uses `Referrer-Policy: strict-origin` so browser form POSTs retain their Origin while sharing no path or query. Other sign-in responses use no-referrer.

## Verification record

The Worker HTTP integration test uses migrated Miniflare D1 and replaces only the external Resend request. It verifies verified-contact handoff, local email confirmation, cross-origin rejection, one-time and concurrent consumption, stable identity across independent sessions, private session projection, and revocation. It does not substitute for live receipt, scheduled notification delivery, or R2/Notion moderation checks.

Record actual production results in [0.2.1 acceptance](version-0.2.1-acceptance.md). The owner explicitly requires that validation before merging the version PR or publishing either npm package. At setup time the implementation PR is merged, the version PR is draft, and 0.2.1 remains unreleased.

Authentication follows the [Better Auth magic-link contract](https://better-auth.com/docs/plugins/magic-link) and [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle). Delivery uses the [Resend Email API](https://resend.com/docs/api-reference/emails/send-email).
