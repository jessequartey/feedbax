---
"feedbax": patch
---

Respect the GitHub integration service's advertised recovery interval in doctor diagnostics, with a fifteen-minute grace and compatibility with older services. The service source now dispatches webhook deliveries through Cloudflare Queues and uses indexed hourly recovery instead of minute polling.
