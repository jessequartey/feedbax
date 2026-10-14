---
status: accepted
---

# Stabilize only trusted Post creation

Only `POST /api/v1/posts` is an external stable mutation in 0.2.0. Browser Capability draft, Vote, and Comment mutations remain internal portal handlers so their protocol may evolve without expanding the public compatibility contract.
