# Notion-native participation in 0.2.0

Feedbax's Notion-only Profile offers voting, native Comments, and a Notion-backed Changelog. All three capabilities are enabled by default and can be disabled independently in typed `feedbax.ts` configuration.

## Guarantees and limits

- A Vote updates the Post's absolute `Vote Count` in Notion. The browser remembers its own confirmed intent, but this is not verified one-person-one-vote state. Clearing browser storage, retries, and concurrent Worker instances can produce duplicates or count drift.
- Trending currently uses the same deterministic ordering as Top: Vote Count, then Created At, both descending. New orders by Created At descending.
- Creating a Post, Comment, or reply through the public portal requires a browser-local Device Profile with a display name and syntactically valid email. Both remain unverified; the email requirement does not prove ownership or Participant identity. The trusted versioned Post submission API is unchanged. Notion-authored Comments are shown as “Product Team,” resolved Comments are hidden, and Participant email is never placed in Comment content or public responses.
- A confirmed Participant Comment receives a browser-local Comment Capability for fifteen minutes. It has no recovery or cross-device transfer path. Rotating `PARTICIPATION_SIGNING_SECRET` invalidates every outstanding Comment Capability and thirty-minute Participation Pass.
- Changelog images are attached and managed directly in Notion. Feedbax neither uploads nor copies them. Temporary Notion file references are refreshed or removed before expiry; text remains available if an image reference cannot safely be served.
- Direct Notion edits may take up to two minutes to appear because public projections are edge-cached.

## Enabling capabilities later

- Voting requires only `features.voting: true`; the canonical Feedback schema always contains Vote Count.
- Comments require `features.comments: true`, a signing secret outside typed configuration, and Notion Read comments and Insert comments capabilities. Run `doctor` after changing permissions.
- Changelog requires `features.changelog: true` and compatible configured Changelog storage. Create or select a separate compatible Data Source and add its identifiers and property mappings before enabling the switch.

There is deliberately no `configure` command in 0.2.0. `doctor` is read-only: it always validates the canonical Feedback Data Source, checks the enabled Comments read path (setup is responsible for proving Insert comments), and validates Changelog only when enabled.

## Stable external API

The stable versioned mutation API exposes only trusted Post submission at `POST /api/v1/posts`. Voting and Comment mutations use internal portal handlers. Changelog has no stable mutation endpoint; Team Members publish it in Notion. Reliable unique voting, verified identity, following, notifications, Participant media, audit history, Changelog detail routes, and a configure command remain out of scope.
