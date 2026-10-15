---
status: accepted
---

# Select one authoritative Content Provider per Installation

The owner approved GitHub as an alternative to Notion for 0.2.2, while preserving existing Notion-only Installations without additional resources. Select one authoritative Content Provider independently of operational storage and Participant identity: GitHub requires explicitly provisioned D1 but never establishes a Verified Participant. Continuous bidirectional synchronization is excluded because it creates competing content and workflow authority.

This extends ADR-0004 and ADR-0021 to apply specifically to Notion Installations, supersedes ADR-0026's Notion-only workflow requirement, and amends the Notion ownership assumptions in ADR-0029 and ADR-0030. Their signed Identity Handoff, reliable participation, consent, and private media guarantees remain. ADR-0006's deep Feedback module remains the seam; Post and Comment adapters contain provider differences, and the Changelog module stays separate. GitHub-only Installations explicitly disable Changelog in this release.

Stable Feedbax identities and slugs survive provider changes; provider identifiers are private mappings. Only approved versioned content is public, so private issue discussion never becomes public as a side effect of publication. See the [shared implementation contract](../version-0.2.2-contract.md).
