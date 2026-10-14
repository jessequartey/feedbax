---
status: accepted
---

# Use a canonical Notion data source

Version 0.2.0 creates and validates a dedicated Feedback Data Source instead of mapping arbitrary Notion schemas, giving the portal, API, and diagnostics one dependable contract. A Deployer may skip creation only by supplying an existing Feedbax-compatible data source, and Product Teams may extend it with custom properties and page content that Feedbax ignores.
