# Host application identity handoff

This example lets Feedbax reuse the session your application already owns. The
host signs a short-lived JWT on its server and redirects the browser to Feedbax;
Feedbax verifies it and creates its own encrypted session cookie. No second
identity provider or user login is required.

The reusable signer is in `src/index.ts`. `nextjs/` is a copyable Next.js App
Router integration; replace its `getHostUser()` and `destroyHostSession()`
stubs with calls to your existing authentication/session library.

## Environment

Generate the secret with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`
and install the same value and key ID on both servers.

Host application (server environment only):

```dotenv
FEEDBAX_ORIGIN=https://feedback.example.com
FEEDBAX_HANDOFF_ISSUER=https://app.example.com
FEEDBAX_HANDOFF_AUDIENCE=feedbax
FEEDBAX_HANDOFF_KEY_ID=handoff-2026-07
FEEDBAX_HANDOFF_SECRET=BASE64URL_32_RANDOM_BYTES
```

Feedbax:

```dotenv
FEEDBAX_AUTH_AUDIENCE=feedbax
FEEDBAX_AUTH_LOGIN_URL=https://app.example.com/feedbax
FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID=session-2026-07
FEEDBAX_AUTH_ISSUERS=[{"issuer":"https://app.example.com","keys":[{"id":"handoff-2026-07","secret":"BASE64URL_32_RANDOM_BYTES"}]}]
FEEDBAX_AUTH_SESSION_KEYS=[{"id":"session-2026-07","secret":"A_DIFFERENT_BASE64URL_32_RANDOM_BYTES"}]
```

Do not prefix the secret with `NEXT_PUBLIC_`, expose it through an API response,
or import the signer into a Client Component. In Next.js, `server-only` makes an
accidental client import fail the build.

## Login redirect flow

1. A signed-out visitor attempts a Feedbax mutation.
2. Feedbax redirects to `FEEDBAX_AUTH_LOGIN_URL`, adding a `return_to` URL.
3. The host route checks its existing session. If absent, it sends the visitor
   through the host's normal login and back to this route.
4. The host validates `return_to`, signs the authenticated user's stable ID and
   public profile on the server, and redirects to Feedbax `/auth/handoff`.
5. Feedbax verifies the JWT, sets its HttpOnly session cookie, and redirects to
   the root-relative `return_path` in the token. The token is gone from the URL.

The host may also link directly to `/feedbax?return_to=` followed by an encoded
`https://feedback.example.com/auth/handoff?return_path=/feedback` URL.

## Logout

Feedbax `POST /auth/logout?return_path=/` clears only the Feedbax cookie. This is
appropriate when “sign out” means leaving feedback identity while retaining the
host session. For global logout, post to the example host `/logout` route. It
destroys the host session and returns a small auto-submitting POST form so the
Feedbax cookie is also cleared. Do not implement logout with a cross-site GET.

## Framework-neutral signing specification

Create a compact JWT using HMAC SHA-256 (`HS256`). Its protected header is
`{"alg":"HS256","kid":"<configured key id>"}`. Sign the exact JWT bytes with
the base64url-decoded shared secret (at least 32 random bytes).

Required claims are `iss`, `aud`, `sub`, `iat`, `exp`, `email`, and `name`.
`sub` must be the immutable host user ID. Optional claims are `picture`,
`company`, `role`, `plan`, and `return_path`. Times are integer Unix seconds;
`exp` should be about two minutes after `iat` and must be no more than five
minutes later. `return_path` must start with one `/` and be local to Feedbax.
Redirect to `https://<feedbax-origin>/auth/handoff?token=<URL-encoded-JWT>`.

Any server framework and standards-compliant JWT library can implement this
contract. Feedbax checks the algorithm, key ID, signature, issuer, audience,
timestamps, claims, and return path before issuing a session.

## Security warnings

- Sign only after authenticating the request with the host's existing session.
- Keep signing and session secrets distinct and only in server secret storage.
- Allowlist the Feedbax origin when accepting `return_to`; never redirect to an
  arbitrary URL supplied by the browser.
- Never log tokens, secrets, cookies, private claims, or raw verification errors.
- Use HTTPS in production. Treat a handoff JWT as a short-lived bearer credential.
- Rotate with overlapping key IDs: configure the new key in Feedbax first, then
  switch the host, wait beyond the token lifetime, and remove the old key.
- Put only identity/profile data in the token. Never include passwords, access
  tokens, authorization secrets, or sensitive application data.
