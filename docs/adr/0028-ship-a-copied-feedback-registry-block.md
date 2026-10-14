# Ship a copied feedback registry block without exposing trusted credentials

Status: accepted

Feedbax 0.2.0 publishes `feedbax-feedback` as a framework-neutral shadcn registry block. The browser module owns the responsive Dialog/Drawer form and accepts injected `onSubmit` and optional `findSimilar` functions. A separate server-only helper accepts the Feedbax base URL and trusted API secret, supplies bearer authentication and idempotency, and must never be imported by client code.

A direct browser client was rejected because any bundled trusted secret is recoverable and would let an attacker submit as the Product Team. A framework-specific route recipe was rejected for 0.2.0 because Feedbax has not committed to maintaining adapters outside TanStack Start. A versioned embeddable package remains deferred; registry installation deliberately transfers source ownership to the adopting Product Team.
