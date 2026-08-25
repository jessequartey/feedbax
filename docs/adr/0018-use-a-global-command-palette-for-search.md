---
status: accepted
---

# Use a global command palette for Participant search

Participant-initiated public Post search uses one portal-wide command palette instead of mutating the Feedback feed's URL state. The palette opens from Cmd/Ctrl+K or page Search buttons, reads through the existing public Post query and cache family, and keeps navigation and contextual Post opening available from every public page.

The Feedback route continues to validate and render a `search` parameter supplied by a direct or restored URL, preserving the existing route contract without making it the primary search interaction. This trades UI-generated shareable search URLs for consistent global keyboard access and a search experience that does not replace the Participant's current page.
