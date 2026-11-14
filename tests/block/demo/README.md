# Block demo

A pretend SaaS dashboard (the "host") plus a stub Feedbax portal, for trying the dialog by hand.

```sh
npx vp dev tests/block/demo --port 5300 --strictPort   # host on :5300, portal stub on :5301
```

Open http://localhost:5300, press **Sign in as Ada**, then **Feedback**. The dialog calls the stub portal
cross-origin with `credentials: 'omit'`; after sending it lands you on the stub's post page, signed in.

Failure injection (put it at the end of the title): `/fail429` (rate limited once), `/fail401` (token rejected once,
recovered by the automatic refresh), `/fail401x2` (rejected twice), `/fail500`, `/failnet` (connection dropped once).
Query params: `?redirect=0` keeps the success state instead of redirecting, `?portal=<url>` points at another portal.

`node tests/block/clean-host.ts --base base|radix --aliases default|custom` installs the built
`public/r/feedbax-feedback.json` into a brand-new shadcn app, then typechecks and builds it (needs the network).
