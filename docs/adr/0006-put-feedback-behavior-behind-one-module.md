---
status: accepted
---

# Put feedback behavior behind one deep module

Routes and HTTP handlers call a deep Feedback module that owns domain rules and Notion translation rather than manipulating Notion properties themselves. The module uses a Notion adapter for production and an in-memory adapter for tests, concentrating external-system complexity behind a small behavioral interface while keeping the same seam as the primary test surface.
