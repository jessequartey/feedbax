# Changelog

## 0.3.0

Rebuilt from scratch. Setup is now one command and a few clicks.

- **One command.** `npx create-feedbax@latest` asks its questions, creates the Cloudflare resources, applies migrations and deploys. Rerunning it resumes a stopped setup.
- **Runs on Cloudflare's free tier.** One Worker with D1 (database), R2 (images), one Queue and one Cron trigger.
- **Notion is the dashboard.** Posts sync to a Notion database every 5 minutes. Change Status in Notion and the portal follows.
- **Optional GitHub issues.** Tick **Send to GitHub** in Notion to create exactly one issue. Closing the issue sets the post to Done.
- **Feedback dialog for your app.** A shadcn block with screenshot capture, annotation, hide-sensitive-info redaction, and single sign-on from your app to the portal.
- **Theming with the shadcn CLI.** `npx shadcn@latest apply --preset <code> --only theme`.
- **Anonymous mode.** An optional switch lets people post without an account.
- Only `create-feedbax` is published. There is no runtime `feedbax` package.

### Migrating from 0.2.x

There is no upgrade path. The architecture, database and configuration changed. Start a new project with `npx create-feedbax@latest`. The 0.2.x code is preserved under the tag [`v0.2.2`](https://github.com/jessequartey/feedbax/tree/v0.2.2).
