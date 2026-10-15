---
status: accepted
---

# Put feedback behavior behind one deep module

Extended by [ADR-0034](0034-select-one-authoritative-content-provider.md) for 0.2.2: keep this module seam while adding GitHub Post and Comment adapters; routes never translate provider payloads.

Routes and HTTP handlers call a deep Feedback module that owns domain rules and Notion translation rather than manipulating Notion properties themselves. The module uses a Notion adapter for production and an in-memory adapter for tests, concentrating external-system complexity behind a small behavioral interface while keeping the same seam as the primary test surface.
