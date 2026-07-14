# Port-or-delete inventory

| Existing area | Disposition | Replacement checkpoint |
| --- | --- | --- |
| Core Zod schemas and branded identifiers | Replace | Effect Schema domain/contracts in 2 |
| Cache behavior and tests | Port | Server cache service in 2 |
| Mutation protection | Port and strengthen | Shared transport middleware in 2–3 |
| Signed handoff implementation/tests | Port and strengthen | Identity provider in 3 |
| Notion reads, writes, and runtime | Replace behind SDK | Notion adapter in 4 |
| Notion doctor, provisioner, and smoke fixtures | Port | Notion tooling in 4 |
| Connector testkit | Replace and expand | Connector compliance suite in 4 |
| Portal feature components | Rebuild | shadcn feature slices in 5 |
| Portal route handlers | Replace | Thin TanStack adapters in 2 and 5 |
| TanStack collections | Delete unless justified | Re-evaluate after board slice in 5 |
| Deployment presets | Replace and verify | Target compositions in 7 |
| Documentation content | Rewrite | Generated-project journey in 7 |
| Mock connector | Replace | Shared in-memory layers/playground in 2 |
| Better Auth dogfood app | Delete intentionally | Deferred beyond 0.1.0 |

Every row must be marked complete in the draft PR before checkpoint 8 closes.
