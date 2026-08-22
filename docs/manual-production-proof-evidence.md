# Manual Production Proof Evidence

- Test window: 2026-08-21 15:03–15:08 UTC
- Revision: `d1a91c1` plus the ticket #24 worktree changes
- Worker: `https://feedbax.jessefquartey.workers.dev`
- Notion database: `…23ad137`
- Notion data source: `…6df7c8`
- Turnstile: intentionally disabled; weaker spam protection accepted for this proof

## Results

- PASS: canonical Feedback Data Source created from the manual setup command.
- PASS: Worker deployed with all 15 required encrypted secrets.
- PASS: `/health` returned `200`, `{"status":"ok"}`, and `Cache-Control: no-store`.
- PASS: anonymous portal submission created a New, unpublished Post.
- PASS: the submitting browser edited its draft.
- PASS: a Team Member changed the item to Planned and Published in Notion.
- PASS: the published item appeared on the public list and Planned roadmap group.
- PASS: the published item opened on its stable detail route and appeared with
  its Feature Request Type and Planned Status filters.
- PASS: the browser edit was rejected after publication.
- PASS: a separate eligible browser draft was withdrawn and trashed.
- PASS: trusted submission authenticated successfully; retrying one idempotency key returned the same Post ID.
- PASS: a controlled invalid deployed data-source secret produced the safe public failure state; the valid secret was restored automatically.
- PASS: the direct Notion moderation edit appeared publicly during the same
  smoke window, within the accepted two-minute freshness bound.
- PASS: Feedbax write invalidation passed its Worker-boundary integration test;
  the live draft edit exercised that write path. No published item is writable
  through Feedbax, so a public live item cannot be mutated solely to observe a
  cache purge, and Cloudflare exposes no external purge receipt.
- PASS: public pages omitted the unpublished trusted Post and Notion-private properties.
- PASS: desktop and keyboard-only navigation, submission, editing, moderation,
  Type/Status filtering, detail, and roadmap paths completed with visible focus,
  labeled controls, validation/submission feedback, and a clear rejection state.
- PASS: mobile-width inspection at 390×844 covered the feedback list,
  submission controls, and roadmap with no horizontal overflow or clipped
  controls.
- PASS: the production Turnstile-disabled warning behavior is covered by its
  runtime test, and the deployed Worker intentionally has no Turnstile secret.
  Ephemeral live console capture is not treated as durable release evidence.
- PASS: `format:check`, lint, type checking, all 68 tests, production build,
  Wrangler dry-run, wizard syntax, and tracked-secret checks completed.

No tokens, API keys, Browser Capabilities, private contact fields, or unredacted
Notion property values are recorded in this evidence file.
