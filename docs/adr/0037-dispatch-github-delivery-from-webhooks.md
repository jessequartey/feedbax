---
status: accepted
---

# Dispatch GitHub delivery from webhooks

The GitHub App service's minute loop repeatedly scanned retained D1 work and created polling jobs for failing acceptance portals, consuming the account's daily read allowance without Participant activity. Dispatch opaque work references from authenticated webhook commits and explicit revocation to a push-based Cloudflare Queue, keeping D1 receipts, leases, attempts and binding-generation fencing authoritative; this replaces the service's minute delivery/polling loop while retaining ADR-0035's scoped authority and current-state reconciliation.

Following ADR-0032's timer CPU constraint, the hourly timer only queues a constant maintenance signal. Indexed maintenance in the consumer repairs missing signals, coalesces pending polling work and performs bounded expiry. Recovery may take an hour or longer under backlog; terminal failures add a 24-hour generation-scoped cooldown, superseding the old five-minute recovery default for this service. Retention policies remain unchanged: full expiry batches queue cleanup-only continuations promptly, rather than relaxing the seven-day payload and thirty-day diagnostic limits. Revocation invalidates authority immediately when observed, bypasses cooldown and receives priority before queued content work. Portal reconciliation and Connected processing retain their existing schedules. The additional Queue and its operations quota are required deployment resources; production rollout and capacity validation remain separate from source review.

Queue signals remain disposable hints: post-commit dispatch failure does not undo HTTP acceptance or revocation, and D1 recovery repairs missing signals. Delays longer than twelve hours stay in D1 until due, while retries on old signals renew the Queue message before acknowledging it. Exhausted or abandoned terminal attempts use the same generation-fenced cooldown transition as ordinary terminal failures.
