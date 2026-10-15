---
status: accepted
---

# Add the Connected Profile foundation through signed identity handoff

Amended by [ADR-0034](0034-select-one-authoritative-content-provider.md) for 0.2.2: signed identity and private operational state remain independent of whether Notion or GitHub owns content. GitHub access alone does not establish Participant identity.

The owner selected signed identity handoff from the Product Team’s existing application for 0.2.1. Feedbax will trust a stable application subject asserted by that application's server, with browser binding, expiry, one-time consumption, and Installation-bound validation; a Device Profile never establishes identity. D1 managed through Drizzle owns identity, sessions, unique Votes, and durable Comment attribution, while Notion continues to own Posts, Team workflow, and native Comment content. This avoids a second login system and preserves Notion-only Installations, at the cost of requiring a trusted server integration for Connected Installations. Adoption proceeds in parallel by owner decision, superseding the previous sequencing prerequisite in SPEC.md.
