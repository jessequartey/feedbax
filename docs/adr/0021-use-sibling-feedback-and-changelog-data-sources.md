---
status: accepted
---

# Use sibling Feedback and Changelog Data Sources

Posts and Changelog Entries use separate data sources because their schemas, lifecycles, views, and query patterns are independent. The two data sources are siblings in one Feedbax Database by default so Product Teams retain one obvious Notion location and permission boundary. A Deployer may instead provide a compatible Changelog Data Source in another database when Product and Marketing require separate access.

A mixed data source was rejected because it would require a discriminator, irrelevant empty properties, cross-content filters, and greater risk of leaking one workflow into another. Always-separate databases were rejected because they add setup and access-management overhead without improving the default Installation.
