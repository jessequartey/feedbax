# Changelog

## 0.3.2 (unreleased)

- **Safer CLI changes.** Add-ons validate credentials before changing config or production secrets; interrupted upgrades resume and record the installed version only after deployment succeeds.
- Email retries skip completed recipients, large audiences continue safely, failed enqueues recover automatically, and `/api/health` reports delivery failures.
- Email and webhook deliveries use their own queue so slow deliveries no longer hold up Notion and GitHub sync.
- Releases require successful main CI for the exact tagged commit before publishing.
- **Moderation privacy.** Hidden, spam, merged and deleted posts stay out of GitHub sync and queued exports; attachments check visibility, and moderated Notion mirrors are archived.
- **Accessibility and settings.** Rich-text fields announce their labels and errors; settings, email and webhook switches keep your latest choice when saves are slow.
- Open posts and create feedback in dialogs from the board or roadmap, keep your place when closing, and share the same URLs as full pages; text drafts survive switching views.
- **Profanity filter.** Posts and comments with profanity are held for review by default; admins can block, switch off, or customize the word lists in Settings.

## 0.3.1

- **One-command Notion setup.** `npx create-feedbax@latest` creates the portal with anonymous feedback on. Sign-in and GitHub stay optional.
- **feedbax CLI.** `migrate`, `add`, `doctor`, `deploy` and `admin`.
- **Admin.** Moderation, users and settings. `npx feedbax admin` prints a signed link that works once.
- **Changelog and RSS.**
- **Email.** Opt-in, via Resend: `npx feedbax add email`.
- **Webhooks.** Opt-in: `npx feedbax add webhooks`. Endpoints are in `/admin/settings`.
- **Rich text.** Editor and rendering for posts, comments and the changelog.
- **Sharing.** Open Graph and X card, favicon, and an optional showcase card.
- **Faster CI.**
- 0.3.0 projects upgrade with `npx feedbax migrate`.

## 0.3.0

Rebuilt from scratch. Setup is now one command and a few clicks.

- **One command.** `npx create-feedbax@latest` asks its questions, creates the Cloudflare resources, applies migrations and deploys. Rerunning it resumes a stopped setup.
- **Social and host login.** GitHub, Google or your app's existing login; email/password login is disabled. GitHub sign-in credentials are separate from the optional Issues token.
- **Free hosting target.** Static portal assets, cached images and bounded sync retries reduce resource use. Social/host login and sync are verified live. Some requests exceeded Workers Free's CPU budget; further optimization is deferred, so Free-limit compliance is not guaranteed.
- **Official Notion template.** Duplicate the board, inbox, calendar and GitHub queue; setup detects the database. Community templates can keep the same schema.
- **Notion is the dashboard.** Posts sync to a Notion database every 5 minutes. Change Status in Notion and the portal follows.
- **Optional GitHub issues.** Tick **Send to GitHub** in Notion to create exactly one issue. Closing the issue sets the post to Done.
- **Feedback dialog for your app.** Install the shadcn registry block by URL or configure `@feedbax` in `components.json`. Includes screenshots, annotation, redaction and host sign-on; see the [install guide](README.md#add-the-feedback-dialog-to-your-app).
- **Theming with the shadcn CLI.** `npx shadcn@latest apply --preset <code> --only theme`.
- **Anonymous mode.** An optional switch lets people post without an account.
- **Hardened setup and sign-in.** Host sign-in asks for identity confirmation, uploads are bounded before parsing, profile names and signing keys are validated, and vote limits protect shared resources. Notion discovery changes only the selected database; one trashed mirror no longer stalls other posts. GitHub issue recovery verifies its origin. Deployment applies additive migrations.

### Migrating from 0.2.x

There is no upgrade path. The architecture, database and configuration changed. Start a new project with `npx create-feedbax@latest`. The 0.2.x code is preserved under the tag [`v0.2.2`](https://github.com/jessequartey/feedbax/tree/v0.2.2).
