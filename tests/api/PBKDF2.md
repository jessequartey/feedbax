# Password CPU measurement

Run with the pinned Node 24 from the repository root:

```sh
node tests/api/measure-pbkdf2.ts
```

This reports process CPU and elapsed wall time for 30 hashes and 30 verifies at the
default `PASSWORD_ITERATIONS` (50,000) after warm-up. Node process CPU includes the Web Crypto worker
thread. It is a local diagnostic, not a Workers CPU result or a Free-plan pass.
Each stored hash carries its own iteration count and verification uses it (accepted range 50,000–100,000), so the default can be raised later without invalidating existing passwords; hashes use a random 16-byte salt.
No real password or hash is printed.

## Live release gate (later, on a dedicated Workers Free account)

1. Deploy the application with the usual D1 migration and secrets workflow to a
   dedicated **Free** account with Workers Logs enabled (`observability.enabled`).
   Use the deployed HTTPS `PORTAL_URL` as the origin, not localhost.
2. Make 30 sequential POST requests to `/api/auth/sign-up/email`, each with a new
   test email, a display name, and a disposable password of 12–128 characters.
   Send JSON and `Origin: <PORTAL_URL>`. Save status and Cloudflare request/ray ID,
   but do not log passwords, cookies or request bodies. Every request must succeed.
3. Make 30 sequential POSTs to `/api/auth/sign-in/email` for those same accounts.
   Pace **both** runs at one request every 7 seconds to stay below the configured
   10 requests/minute/IP. Do not count 429s or failed authentication as samples.
4. In Cloudflare Workers Logs, filter by this Worker, auth request path and time
   range. Export the invocation records and read `cpuTimeMs`. Compute the nearest
   rank p95 separately for sign-up and sign-in (sorted sample number 29 of 30).
   Record the date, Free plan, deployment/commit, iteration count, sample count,
   median, p95 and maximum for both operations. Measure full invocation CPU,
   including D1 and Better Auth, not just PBKDF2 elapsed time.
5. Both p95s must be **≤9 ms** at the default of 50,000 (the floor). Use accounts created
   at the current default. A 100k hash made by another install still verifies, but it is
   slower, so do not mix it into the sample.
6. If either p95 exceeds 9 ms at 50k, stop and escalate to the owner. Never lower below 50k
   or silently require Paid. The owner chooses Paid or social/host login only on Free. W6
   records the real results in the README and the owner records them in decisions.md; W1
   does not edit those files.
7. If both pass with margin, `PASSWORD_ITERATIONS` may be raised (never above 100,000, the
   Workers cap) and re-measured; existing hashes keep working.

Also measure board SSR, post SSR, a create-post invocation with three images, and
the queue consumer on the same Free account before release (spec §14). Local
results do not satisfy those gates. No deployment or credentialed measurement was
performed as part of this workstream.

## Local evidence, 2026-11-14

Node v24.22.3, 30 samples per operation. Process CPU includes the Web Crypto worker thread.

| Iterations | Operation |   CPU p50 |   CPU p95 |  Wall p50 |  Wall p95 |
| ---------: | --------- | --------: | --------: | --------: | --------: |
|    100,000 | Hash      | 15.030 ms | 15.920 ms | 15.057 ms | 15.559 ms |
|    100,000 | Verify    | 15.029 ms | 15.508 ms | 15.045 ms | 15.149 ms |
|     50,000 | Hash      |  7.509 ms |  7.855 ms |  7.507 ms |  7.719 ms |
|     50,000 | Verify    |  7.500 ms |  7.993 ms |  7.480 ms |  7.542 ms |

100k is above the 9 ms gate locally, so the default is the 50k floor. No Workers Free result is
available yet; these Node numbers do not replace the live gate above, and the 50k default is
not yet confirmed to fit Workers Free (request CPU also includes D1 and Better Auth).
