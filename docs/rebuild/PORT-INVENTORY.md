# Port-or-delete inventory

| Existing area                                  | Disposition             | Replacement checkpoint                  | Status   | Evidence                                                                     |
| ---------------------------------------------- | ----------------------- | --------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Core Zod schemas and branded identifiers       | Replace                 | Effect Schema domain/contracts in 2     | Complete | Effect-backed public core, domain, contracts, and configuration schemas      |
| Cache behavior and tests                       | Port                    | Server cache service in 2               | Complete | Cache adapter tests, private/public cache separation, deployment semantics   |
| Mutation protection                            | Port and strengthen     | Shared transport middleware in 2–3      | Complete | Origin, body, identity, rate-limit, captcha, and sanitized-error tests       |
| Signed handoff implementation/tests            | Port and strengthen     | Identity provider in 3                  | Complete | Claim, replay, return-URL, key-rotation, and cookie tests                    |
| Notion reads, writes, and runtime              | Replace behind SDK      | Notion adapter in 4                     | Complete | SDK adapter plus deterministic connector and interaction-store suites        |
| Notion doctor, provisioner, and smoke fixtures | Port                    | Notion tooling in 4                     | Complete | Doctor, provision, seed, fixture preparation, and opt-in smoke commands      |
| Connector testkit                              | Replace and expand      | Connector compliance suite in 4         | Complete | Descriptor, capability, health, error, and repository compliance tests       |
| Portal feature components                      | Rebuild                 | shadcn feature slices in 5              | Complete | Board, detail, submission, voting, comments, roadmap, changelog, states      |
| Portal route handlers                          | Replace                 | Thin TanStack adapters in 2 and 5       | Complete | Shared server-function/route mapping with transport-neutral operations       |
| TanStack collections                           | Delete unless justified | Re-evaluate after board slice in 5      | Complete | Retained for paged canonical data and rollback-safe optimistic mutations     |
| Deployment presets                             | Replace and verify      | Target compositions in 7                | Complete | Packed Cloudflare, Vercel, and Node builds plus Docker smoke evidence        |
| Documentation content                          | Rewrite                 | Generated-project journey in 7          | Complete | Launch-accurate quickstart, configuration, identity, Notion, and deploy docs |
| Mock connector                                 | Replace                 | Shared in-memory layers/playground in 2 | Complete | Effect test layers and explicit portal/playground fixture implementations    |
| Better Auth dogfood app                        | Delete intentionally    | Deferred beyond 0.1.0                   | Complete | Removed from workspace, generator, matrices, documentation, and gates        |

Every row must be marked complete in the draft PR before checkpoint 8 closes.
