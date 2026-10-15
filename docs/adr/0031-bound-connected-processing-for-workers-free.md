# Bound Connected processing for small Workers Free installations

The owner operates Workers Free and selected slower bounded processing rather than a plan upgrade. Connected Installations default to `processing: "small"`: each scheduled invocation observes one followed Post, attempts one notification email, and cleans up at most five images; leases, cursors, deduplication, and retries retain unfinished work for later runs. `processing: "standard"` retains ten Posts, twenty attempts, and fifty cleanups for Workers Paid, superseding ADR-0030's universal Paid target while preserving Cloudflare Email Service's separate Paid requirement.

The tradeoff is throughput and latency: at a five-minute cadence, small mode has at most 288 observations and 288 email attempts per day across an Installation, and existing 24-hour delivery expiry still applies. Actual CPU use and backlog must be verified on the target account; this setting does not raise platform quotas or promise delivery under sustained overload.

Small-mode execution was superseded by [ADR-0032](0032-dispatch-small-processing-through-cloudflare-queues.md) after live CPU validation. The original bounds remain, but the timer now signals a queue consumer.
