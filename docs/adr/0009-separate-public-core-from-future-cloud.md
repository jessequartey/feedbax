---
status: accepted
---

# Separate the public core from a future private cloud repository

The local planning workspace contains a canonical public `core/` Git repository and, only when proprietary hosted code exists, a separate private `cloud/` repository that consumes exact tagged core releases. This keeps community contributions, CI, issues, and source history canonical in public while avoiding a private-first subtree mirror and preventing speculative hosted code from expanding the proof release.
