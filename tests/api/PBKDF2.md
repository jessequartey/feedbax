# Password CPU measurement

Run with the pinned Node 24 from the repository root:

```sh
node tests/api/measure-pbkdf2.ts
```

This reports process CPU and elapsed wall time for 30 hashes and 30 verifies at
100,000 iterations after warm-up. Node process CPU includes the Web Crypto worker
thread. It is a local diagnostic, not a Workers CPU result or a Free-plan pass.
The stored iteration count drives verification; hashes use a random 16-byte salt.
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
5. Both p95s must be **≤9 ms** at 100k. Otherwise change `PASSWORD_ITERATIONS` once
   to **50,000**, redeploy, and repeat using fresh accounts. Verification of old
   100k hashes still uses 100k, so use accounts created at 50k for that run.
6. If either p95 still exceeds 9 ms at 50k, stop and escalate to the owner. Never
   lower below 50k or silently require Paid. The owner chooses Paid or social/host
   login only on Free. W6 records the real results in the README and the owner
   records them in decisions.md; W1 does not edit those files.

Also measure board SSR, post SSR, a create-post invocation with three images, and
the queue consumer on the same Free account before release (spec §14). Local
results do not satisfy those gates. No deployment or credentialed measurement was
performed as part of this workstream.

## Local evidence, 2026-11-14

Node v24.22.3, 30 samples per operation, 100k iterations:

| Operation |   CPU p50 |   CPU p95 |  Wall p50 |  Wall p95 |
| --------- | --------: | --------: | --------: | --------: |
| Hash      | 15.030 ms | 15.920 ms | 15.057 ms | 15.559 ms |
| Verify    | 15.029 ms | 15.508 ms | 15.045 ms | 15.149 ms |

No Workers Free result is available yet. Keep 100k until the real gate is run;
these Node numbers alone do not authorize an iteration reduction.
