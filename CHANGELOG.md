# Changelog

## 0.3.0

Rebuilt from scratch. Setup is now one command and a few clicks.

- **One command.** `npx create-feedbax@latest` asks its questions, creates the Cloudflare resources, applies migrations and deploys. Rerunning it resumes a stopped setup.
- **Lower resource use.** Fewer database reads, cached images and assets, and bounded sync retries keep typical daily usage within the Free plan; live CPU measurements are pending.
- **Official Notion template.** Duplicate the board, inbox, calendar and GitHub queue; setup detects the database. Community templates can keep the same schema.
- **Notion is the dashboard.** Posts sync to a Notion database every 5 minutes. Change Status in Notion and the portal follows.
- **Optional GitHub issues.** Tick **Send to GitHub** in Notion to create exactly one issue. Closing the issue sets the post to Done.
- **Feedback dialog for your app.** Install the shadcn registry block by URL or configure `@feedbax` in `components.json`. Includes screenshots, annotation, redaction and host sign-on; see the [install guide](README.md#add-the-feedback-dialog-to-your-app).
- **Theming with the shadcn CLI.** `npx shadcn@latest apply --preset <code> --only theme`.
- **Anonymous mode.** An optional switch lets people post without an account.
- **Hardened setup and sign-in.** Host sign-in asks for identity confirmation, uploads are bounded before parsing, profile names and signing keys are validated, and vote limits protect shared resources. Notion discovery changes only the selected database; one trashed mirror no longer stalls other posts. GitHub issue recovery verifies its origin. Deployment applies additive migrations.
- **Coming later:** Admin: manage users, Webhooks, Changelog & product updates, Admin settings and Email notifications. Nothing to configure for notifications yet.
- Only `create-feedbax` is published. There is no runtime `feedbax` package.

### Migrating from 0.2.x

There is no upgrade path. The architecture, database and configuration changed. Start a new project with `npx create-feedbax@latest`. The 0.2.x code is preserved under the tag [`v0.2.2`](https://github.com/jessequartey/feedbax/tree/v0.2.2).
