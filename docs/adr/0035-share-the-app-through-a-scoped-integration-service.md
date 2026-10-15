---
status: accepted
---

# Share the App through an Installation-scoped integration service

One official GitHub App uses an integration service that holds the App private key and verifies webhooks, rather than copying a shared key into every portal. The same Apache-2.0 implementation supports a team-owned App and self-hosted service; optional managed operation does not move functionality out of Core or change ADR-0009/ADR-0013 licensing.

Prove portal and GitHub resource control before pairing. Authenticated Portal Bindings and Installation-scoped credentials isolate portals even when one GitHub App installation serves several Installations. Durable receipts, bounded retries, fencing, and authoritative reconciliation recover partial writes without an exactly-once claim. Successful raw webhook payloads are deleted, failed payloads expire within seven days of receipt, and sanitized diagnostics expire within 30 days; provider reconciliation recovers work after expiry. App credentials and private events never enter public responses or routine logs.
