# Connected Profile in 0.2.1

Connected Profile is optional. Omit `connected` to retain Notion-only behavior. A Connected Installation requires a dedicated D1 database and an existing Product Team application that authenticates Participants on its server. There is no Feedbax email sign-in.

## Configure an Installation

Create a D1 database using `pnpm exec wrangler d1 create <installation-name>`. Review the target account and add the returned identifiers to `wrangler.jsonc`:

```json
{
  "d1_databases": [
    {
      "binding": "FEEDBAX_DB",
      "database_name": "your-installation",
      "database_id": "your-database-id",
      "migrations_dir": "migrations"
    }
  ]
}
```

Apply the included migration using `pnpm exec wrangler d1 migrations apply FEEDBAX_DB --remote` (and `--local` for local testing). Never share this database between Installations. Configure HTTPS for local sign-in testing because identity cookies require Secure.

Add the following to `src/feedbax.ts`, alongside an absolute HTTPS `product.siteUrl`:

```ts
connected: {
  issuer: "https://app.example.com",
  loginUrl: "https://app.example.com/feedbax-login",
},
```

Generate at least 32 random bytes for `IDENTITY_HANDOFF_SECRET`. Store the same secret only on the Product Team application's server and in the portal's `.dev.vars` / encrypted Worker secrets. Never place it in `feedbax.ts`, frontend code, a query string, or logs. The lifecycle CLI deploys this secret alongside the other configured secrets. `feedbax doctor` checks the configuration and reads the remote D1 schema without changing it.

## Product application handoff

1. Feedbax's Sign in action visits `/internal/identity/start`, sets a five-minute browser challenge cookie, and redirects to the configured login URL with `state` and `callback` query parameters.
2. The Product Team application authenticates the current user. It must allow only the exact configured Feedbax callback, retain the supplied state, and derive the stable subject and display name from its authenticated server session. Never sign identity fields supplied by a browser.
3. Sign the payload below on the application server with HMAC-SHA256. Times are Unix seconds; the token lifetime must be at most 120 seconds. Use an unpredictable nonce. The audience must exactly equal the Feedbax origin and the issuer must exactly equal the configured issuer.
4. Return an HTML form which posts one `token` field to the allowlisted callback. Use `application/x-www-form-urlencoded` and `Referrer-Policy: no-referrer`. Do not put the token in a redirect URL. HTML-escape interpolated values.
5. Feedbax validates the signature, origin, browser challenge, audience, issuer, and expiry, consumes the token nonce and browser challenge once, and creates an opaque seven-day HttpOnly session. Sign out revokes that session in D1. No identity token is stored in browser JavaScript storage.

```js
import { createHmac, randomBytes } from "node:crypto";

// All identity values come from the application's authenticated server session.
const now = Math.floor(Date.now() / 1000);
const payload = Buffer.from(
  JSON.stringify({
    purpose: "feedbax-identity-v1",
    subject: authenticatedUser.id,
    displayName: authenticatedUser.displayName,
    issuer: "https://app.example.com",
    audience: "https://feedback.example.com",
    state: validatedBrowserState,
    nonce: randomBytes(32).toString("base64url"),
    issuedAt: now,
    expiresAt: now + 120,
  }),
).toString("base64url");
const signature = createHmac("sha256", process.env.IDENTITY_HANDOFF_SECRET)
  .update(`feedbax-identity-v1:${payload}`)
  .digest("base64url");
const token = `${payload}.${signature}`;
```

The application must use the same stable subject across browsers; never use display name or an unverified email as the subject. “Verified” means asserted by that trusted application, not legal identity or a guarantee of one account per human. The stored identity is scoped to the configured issuer and subject. Changing the issuer or subject scheme requires deliberate identity migration; do not repurpose identifiers for other people. Secret rotation blocks old handoffs; existing opaque sessions remain valid until expiry, logout, or explicit database revocation.

## Data ownership and compatibility

Notion remains authoritative for Posts, publication, Team workflow, and Comment content. D1 owns identity, sessions, unique Votes, and verified Comment attribution. A unique database key enforces one Vote per subject and Post; repeated add/remove requests are idempotent. Counts and Top ordering in Connected Profile use D1, including across browsers. Anonymous historical Notion counts are preserved in Notion but excluded from verified counts; they cannot be migrated into verified Votes without identity evidence. The Notion Vote Count property remains the legacy Notion-only counter, not a synchronized Connected counter.

Native Comments receive the signed display name on the server. Only Comments with durable D1 attribution are labeled Verified; historical Comments remain Unverified. Notion-authored Comments retain the Product Team label. Resolving/deleting a Comment in Notion still removes it from public reads. Browser-held fifteen-minute Comment capabilities and unpublished Post draft capabilities retain their existing scope; this release does not add cross-device Comment editing or recover draft capabilities. Post submission still uses a private contact Device Profile, editable through Contact profile; it does not gain an identity-verification badge.

If D1 is unavailable, Connected operations fail closed. They never fall back to anonymous voting or trust a browser-provided name. Attribution failures reject creation and attempt to remove the just-created Notion Comment; if external cleanup also fails, any surviving Comment remains unverified. The portal does not automatically retry Comment creation, since Notion offers no creation idempotency guarantee.

Back up the database and use Cloudflare D1 recovery before destructive changes. Disabling `connected` retains D1 data but switches visible Vote counts back to Notion-only history. Expired sessions/nonces may be purged during maintenance after their expiry; never delete active rows to reset Votes.

## Verification and operating limits

Before enabling in production, test the real application's sign-in/callback, a second browser, duplicate Votes, sign out, invalid/expired/replayed tokens, and a native Notion Comment with verified attribution. Use the dedicated acceptance Installation; do not turn on the dogfood portal until a real application login endpoint is configured.

Connected Top ranking currently reads all matching Published Posts before ranking and pagination. This favors correct ranking for the initial small-team scope; measure larger installations before adoption. Public counts can be briefly cached under the existing public-read policy; private Vote state and identity endpoints are never publicly cached.

Implementation references: [D1 database batches](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [Drizzle D1 adapter](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).
