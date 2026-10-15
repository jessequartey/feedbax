---
status: accepted
---

# Use a canonical Notion data source

Amended by [ADR-0034](0034-select-one-authoritative-content-provider.md) for 0.2.2: this contract remains authoritative for Notion Installations; GitHub uses its own adapter and explicit content contract.

Version 0.2.0 creates and validates a dedicated Feedback Data Source instead of mapping arbitrary Notion schemas, giving the portal, API, and diagnostics one dependable contract. A Deployer may skip creation only by supplying an existing Feedbax-compatible data source, and Product Teams may extend it with custom properties and page content that Feedbax ignores.
