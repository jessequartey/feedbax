---
status: accepted
---

# Use browser-held capabilities for draft editing

The Notion-only Profile lets a submitting browser edit or withdraw its New, unpublished Draft Post by presenting a strong random secret whose hash is stored in Notion. The browser keeps a capability per Post so several drafts remain editable. The raw secrets remain only in browser storage, provide no identity or email verification, have no recovery path, and stop authorizing changes after publication or triage; this gives Participants limited draft correction without pretending that local storage is an account system or weakening published content.
