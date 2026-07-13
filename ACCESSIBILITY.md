# Accessibility Review Record

Feedbax targets practical WCAG 2.1 Level A and AA behavior. This record documents the tested scope; it is not a certification or an unconditional conformance claim for every deployment.

## Automated gate

Run `pnpm test:a11y`. Chromium and axe-core cover the portal in light/dark and reduced-motion modes, empty/search/error/not-found states, feedback dialog behavior, and the site home, docs, and search dialog.

## Manual release checklist

Verify in current Chrome and Safari on macOS before release:

- [ ] Skip links move focus to the primary content.
- [ ] Header navigation, theme controls, filters, voting, and recovery actions work without a pointer.
- [ ] Feedback and docs search dialogs contain focus, close with Escape, and return focus to their opener.
- [ ] Invalid form submission focuses the first invalid field and announces its error.
- [ ] Loading, background refresh, search results, mutation outcomes, and errors are announced without duplicate speech.
- [ ] Roadmap status-jump links and linear heading order provide a usable nonvisual route through the board.
- [ ] Touch targets remain usable at narrow viewport sizes and content remains readable at 200% zoom.
- [ ] Safari VoiceOver identifies landmarks, dialog names, state announcements, and roadmap status sections.

Record browser and macOS versions plus any known limitations in the release notes when completing this checklist.
