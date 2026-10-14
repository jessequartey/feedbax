---
status: accepted
---

# Separate project creation from lifecycle commands

`create-feedbax` generates a versioned, Product-Team-owned application, while the project-local `feedbax` package handles read-only diagnostics, explicit deployment, API-key rotation, and project information. This prevents bootstrap concerns from becoming a permanent runtime interface and allows future upgrades to use reviewed migrations instead of silently overwriting customized source.
