---
status: accepted
---

# Count roadmap statuses through cursor reads

Notion data-source queries do not expose a total result count, while the public roadmap contract requires an exact count for each roadmap Post Status. Feedbax therefore fetches the first 25-Post page per status and follows its remaining cursors in 100-Post pages to calculate the count, trading the earlier one-query roadmap cache miss for accurate columns and removal of the 100-Post failure; it still performs no per-Post follow-up requests. Loaded-only counts were rejected because they misrepresent a column, and Notion view queries were rejected because an Installation configures a canonical data source rather than stable view IDs.
