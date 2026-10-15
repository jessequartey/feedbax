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

## Complete application endpoint

Copy the following into your application's server code. It returns a standard Web `Response` and works behind a Node-compatible route handler. Configure the app's existing authentication middleware before this endpoint so an unauthenticated Participant is taken through normal app sign-in and returned to the same handoff URL. If your middleware does not redirect, the example returns an explicit 401; sign in to the product first and retry Feedbax.

The only app-specific dependency is `authenticate(request)`: call the same trusted session lookup used by your protected app pages. Return a stable internal user ID as `subject` and its server-read display name. Never read these values from form input, query parameters, browser storage, or an unsigned header. Do not hardcode a demonstration user in production.

```ts title="server/feedbax-login.ts"
import { createHmac, randomBytes } from "node:crypto";

export function createIdentityLoginHandler(options: {
  applicationOrigin: string;
  portalOrigin: string;
  issuer: string;
  secret: string;
  authenticate(
    request: Request,
  ): Promise<{ subject: string; displayName: string } | null>;
}) {
  const app = new URL(options.applicationOrigin).origin;
  const portal = new URL(options.portalOrigin).origin;
  if (
    ![app, portal, options.issuer].every(
      (url) => new URL(url).protocol === "https:",
    ) ||
    options.secret.length < 32
  )
    throw new Error(
      "Configure HTTPS origins and a server-only handoff secret of at least 32 characters.",
    );
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405, headers });
    const state = url.searchParams.get("state");
    const callback = url.searchParams.get("callback");
    if (
      url.origin !== app ||
      !state ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      callback !== `${portal}/internal/identity/callback` ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("callback").length !== 1
    )
      return new Response("Invalid Feedbax sign-in request", {
        status: 400,
        headers,
      });
    const user = await options.authenticate(request);
    if (!user)
      return new Response(
        "Sign in to your product, then retry Feedbax sign-in.",
        { status: 401, headers },
      );
    if (
      ![user.subject, user.displayName].every(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0 &&
          value.length <= 512,
      )
    )
      return new Response("Application identity is incomplete", {
        status: 403,
        headers,
      });
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        purpose: "feedbax-identity-v1",
        subject: user.subject,
        displayName: user.displayName,
        issuer: options.issuer,
        audience: portal,
        state,
        nonce: randomBytes(32).toString("base64url"),
        issuedAt: now,
        expiresAt: now + 120,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", options.secret)
      .update(`feedbax-identity-v1:${payload}`)
      .digest("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Continue to feedback</title><body><form method="post" action="${escapeHtml(callback)}"><input type="hidden" name="token" value="${payload}.${signature}"><button type="submit">Continue to feedback</button></form><script nonce="${nonce}">document.forms[0].requestSubmit()</script></body></html>`;
    return new Response(html, {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; form-action ${portal}; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
      },
    });
  };
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
```

Register the handler at the exact URL configured as `connected.loginUrl`. For a framework with Web route handlers, the wiring looks like this (adapt the import paths and session lookup to your application):

```ts
import { createIdentityLoginHandler } from "./server/feedbax-login";
import { readAuthenticatedAppUser } from "./server/auth";

export const GET = createIdentityLoginHandler({
  applicationOrigin: "https://app.example.com",
  portalOrigin: "https://feedback.example.com",
  issuer: "https://app.example.com",
  secret: process.env.IDENTITY_HANDOFF_SECRET!,
  authenticate: async (request) => {
    const user = await readAuthenticatedAppUser(request);
    return user ? { subject: user.id, displayName: user.displayName } : null;
  },
});
```

`readAuthenticatedAppUser` is your existing application's authentication adapter, not a Feedbax API. On Next.js, the `GET` export belongs in `app/feedbax-login/route.ts`; keep the factory and session lookup in server-only modules. On TanStack Start, call the same handler from a server route's GET handler. Other frameworks can adapt their request/response objects to the Web API. Keep the route behind your current session middleware and rate limits; Feedbax does not create or manage the product's accounts.

## Verify the entire sign-in loop

1. Run `feedbax doctor`, build, and deploy the configured portal. Confirm its HTTPS origin exactly matches `product.siteUrl` and the application's configured audience/callback.
2. Sign in to the product, open the portal, and choose Sign in. You should return with your server-provided display name. A handoff form never includes your API key or handoff secret.
3. Add a Vote, reload, and sign in from another browser with the same product account. The Vote should still be selected. Repeated add requests must not increase it twice.
4. Post a Comment and confirm Verified appears next to its app-provided name. A historical browser-only Comment still shows Unverified. Reply/resolve from Notion and confirm moderation is reflected after refresh.
5. Sign out of Feedbax. Its session should stop authorizing Votes/Comments immediately. This signs out only the portal session; product sign-out is managed by the product. An already-issued portal session expires after seven days unless explicitly revoked sooner.
6. Reuse a captured callback or change its state/audience/signature in a dedicated test environment. Feedbax must reject it. Do not copy production identity tokens into logs or issue reports.

## Authentication troubleshooting

| Symptom                                               | Check                                                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product endpoint returns 401                          | Use your existing session middleware and complete the product's login first; the `authenticate` adapter must read that session.                                                                           |
| Invalid sign-in request on the product                | Preserve the single `state` and `callback` parameters; allow only the configured exact callback. Do not rebuild the callback from arbitrary browser input.                                                |
| Callback returns 403                                  | The form must POST directly from the configured login URL's origin. Check reverse-proxy origin handling and sandbox policies.                                                                             |
| Callback returns 401                                  | Check identical handoff secrets, exact issuer/audience, current server clocks, a lifetime of at most 120 seconds, and an unused browser challenge. Start sign-in again after a failed or expired attempt. |
| Challenge cookie absent                               | Use HTTPS and the same browser. The challenge uses Secure, HttpOnly, SameSite=None, and the `__Host-` prefix. Cookie-blocking policies may require a normal top-level product/portal flow.                |
| Doctor or participation returns unavailable           | Check the dedicated `FEEDBAX_DB` binding, applied migration, remote account/database, and required Worker secrets. The profile fails closed.                                                              |
| Name differs from the current app name                | A session reads the last server-asserted name; sign in again after a profile change. Old Comments retain their recorded attribution.                                                                      |
| Anonymous vote totals differ after enabling Connected | Historical Notion counters are not verified Vote records; Connected counts only D1 Votes.                                                                                                                 |

## Keep the three server secrets distinct

| Secret                                               | Stored where                                | Purpose                                                                 |
| ---------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `IDENTITY_HANDOFF_SECRET`                            | Product server and portal secret store      | Sign/verify identity handoffs.                                          |
| `PARTICIPATION_SIGNING_SECRET`                       | Portal secret store                         | Participation Passes and short-lived Comment capabilities.              |
| `FEEDBAX_API_SECRET` / portal `FEEDBAX_API_KEY_HASH` | Plaintext on product server; hash on portal | Trusted Post submission from the feedback block or another integration. |

Generate independent random values. Store production values through your platform's secret manager. When rotating the handoff secret, coordinate both servers; existing portal sessions require separate revocation if they must be ended immediately.
