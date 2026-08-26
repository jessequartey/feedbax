# Security policy

Feedbax handles Notion credentials, trusted-submission API keys, Turnstile secrets, private submitter contact data, and browser-held draft capabilities. Please report suspected exposure or authorization failures privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting when the repository's **Report a vulnerability** action is available. Until then, open a minimal issue asking the repository owner to establish a private reporting channel; do not include vulnerability details. Do not place real credentials, private Post data, or raw Browser Capabilities in any public report.

Include the affected version or commit, the smallest reproducible example, the expected security boundary, the observed behavior, and any known mitigations. Maintainers aim to acknowledge a complete report within five business days and will coordinate disclosure after a fix or mitigation is available.

## Supported versions

Before the final 0.2.0 release, only the latest published 0.2.0 prerelease is supported. After 0.2.0, the latest released patch receives security fixes unless a release notice states otherwise.

## Security boundaries

- Secrets belong in ignored local files or Cloudflare's encrypted secret store, never public configuration, logs, responses, or URLs.
- Public projections contain only explicitly approved Post fields.
- Browser Capabilities authorize limited changes to New, unpublished drafts; they are not identity or email verification.
- Live Notion credentials are never used in pull-request CI.
