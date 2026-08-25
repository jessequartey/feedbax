# Feedbax Roadmap

This roadmap separates the proof release from the larger platform vision. It records direction, not delivery promises or dates.

## Version 0.2.0 alpha: prove the Notion-native loop

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

## Version 0.2.0: make the proof adoptable

- `create-feedbax` interactive generator using a versioned Feedbax-owned template
- `doctor` diagnostics and API-key rotation
- Documentation application on Cloudflare
- shadcn theme preset workflow
- Dogfooded Feedbax feedback portal
- Design-partner feedback and production-derived fixes

## Connected Profile

- Verified Participant identity and signed identity handoff
- D1 operational state managed through Drizzle
- Reliable unique voting and verified Comment attribution
- Following and notifications
- Participant media storage in R2
- Abuse controls and synchronization hardening
- Reconsider Effect only for workflows whose complexity justifies it

## Ecosystem

- First evidence-backed connector and connector interface
- Versioned npm connector packages
- Optional shadcn registry recipes for copied integrations and widgets
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
