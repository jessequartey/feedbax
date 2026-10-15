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

## Version 0.2.1 — shipped 2026-10-15

Published `feedbax@0.2.1` and `create-feedbax@0.2.1`; production acceptance and release evidence are recorded in [0.2.1 acceptance](docs/version-0.2.1-acceptance.md). Adoption remains owner-led parallel work.

- Verified Participant identity through signed handoff from the Product Team’s existing application
- D1 operational state managed through Drizzle
- Reliable unique voting per verified Participant and Published Post
- Verified Comment attribution backed by durable identity mappings
- Optional Connected Profile; existing Notion-only Installations retain their behavior
- Generated installation, diagnostics, documentation, and release verification for both profiles
- Per-Post following, private in-app and opt-in email Notifications, and private R2 Image Attachments

## Version 0.2.2 — GitHub integration and feedback operations

Implementation contract established after the 0.2.1 release. See [the complete 0.2.2 implementation handoff](docs/version-0.2.2-plan.md) and [shared contract](docs/version-0.2.2-contract.md) for requirements, sequencing, compatibility, and acceptance cases. The owner deferred new Team Member tools; tool-dependent merge, moderation, and manual recovery execution remains deferred unless a safe native provider workflow meets its criteria. The bullets below retain the original workstreams and do not imply delivery.

- GitHub as an alternative to Notion, with one configurable Feedbax GitHub App, an open-source self-hosted path, optional Projects, and explicit public/private visibility
- Merge duplicate Posts while preserving links, attribution, Votes, and Follows
- Private cross-device My feedback for Verified Participants
- Public decisions and observed progress history with release links
- Safe customized upgrades, backup, and restore
- Integration health, recovery, and reconciliation
- Reporting, Participant restrictions, and batch moderation
- Portable import/export and Notion/GitHub provider migration

## Owner-led adoption and operations

- Three independent design-partner installations and interviews
- Human-authored Notion reply/resolve walkthrough
- Official custom domains
- Production-derived fixes informed by adoption

## Later Connected Profile work

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
