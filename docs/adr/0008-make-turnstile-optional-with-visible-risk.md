---
status: accepted
---

# Make Turnstile optional with visible production risk

Anonymous submissions always use Cloudflare's native burst-limiting binding, while Turnstile remains optional so a Deployer can complete a minimal setup without another widget configuration step. When Turnstile is absent, `doctor` and the documentation prominently report weaker spam protection; when it is present, the Worker must validate every token through Siteverify and fail closed on verification failure.
