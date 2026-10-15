# Feedbax Roadmap

This roadmap separates the proof release from the larger platform vision. It records direction, not delivery promises or dates.

## Version 0.2.0 — shipped 2026-10-15

Published `feedbax@0.2.0` and `create-feedbax@0.2.0`; release acceptance is recorded in `docs/version-0.2.0-acceptance.md`.

### Notion-native loop

- TanStack Start portal on Cloudflare Workers
- Notion-only Profile
- Canonical Feedback Data Source and schema validation
- Anonymous moderated submissions
- Browser Capability draft editing
- Public feedback, statuses, and roadmap
- Best-effort browser-remembered Votes and native Notion Comments
- Notion-backed Changelog in a sibling Changelog Data Source
- Trusted HTTP submission endpoint
- Typed `feedbax.ts` configuration
- Manual deployment proven before CLI automation

### Installation and operation

- `create-feedbax` interactive generator using a versioned Feedbax-owned template
- `doctor` diagnostics and API-key rotation
- Documentation application on Cloudflare
- shadcn theme preset workflow
- Framework-neutral shadcn feedback registry block with server-only trusted client helper
- Dogfooded Feedbax feedback portal

## Version 0.2.1 — Connected Profile foundation

In development. The owner selected this scope on 2026-10-15; adoption runs in parallel and is no longer a prerequisite to implementation.

- Verified Participant identity through signed handoff from the Product Team’s existing application
- D1 operational state managed through Drizzle
- Reliable unique voting per verified Participant and Published Post
- Verified Comment attribution backed by durable identity mappings
- Optional Connected Profile; existing Notion-only Installations retain their behavior
- Generated installation, diagnostics, documentation, and release verification for both profiles

## Owner-led adoption and operations

- Three independent design-partner installations and interviews
- Human-authored Notion reply/resolve walkthrough
- Official custom domains
- Production-derived fixes informed by adoption

## Later Connected Profile capabilities

- Following and notifications
- Participant media storage in R2
- Abuse controls and synchronization hardening
- Reconsider Effect only for workflows whose complexity justifies it

## Ecosystem

- First evidence-backed connector and connector interface
- Versioned npm connector packages
- Additional shadcn registry recipes for copied integrations and widgets
- Embeddable widget
- Additional application-framework templates after demonstrated demand or outside maintainership
- Vercel and Docker deployment after Cloudflare parity is stable

## Explicit non-goals for the proof release

- Multi-framework generation
- Generic plugin registry
- Effect
- Drizzle or an application database
- Vercel or Docker deployment
- Path-based microfrontends
- Hosted billing or enterprise features
- Follow updates and notification delivery
- Participant-uploaded media and Comment attachments
- Participation audit history
- A velocity-based Trending algorithm
