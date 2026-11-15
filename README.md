<img src=".github/readme/hero.gif" alt="Feedbax setup summary, live feedback board and roadmap" width="100%" />

# Feedbax

A self-hosted feedback portal: collect ideas, votes and comments, triage in Notion, and turn approved posts into GitHub issues.

[![npm version](https://img.shields.io/npm/v/create-feedbax.svg)](https://www.npmjs.com/package/create-feedbax)
[![license](https://img.shields.io/npm/l/create-feedbax.svg)](LICENSE)

[Try the demo](https://feedbax.juutech.africa) · [Roadmap](https://feedbax.juutech.africa/roadmap)

## Quick start with an agent

Paste this into Claude Code, T3 Code, Cursor, Codex or a similar agent. Keep tokens in its secret input, not in chat.

```text
Set up and deploy Feedbax from https://github.com/jessequartey/feedbax#readme.

1. Run `npx create-feedbax@latest --help`, then `npx create-feedbax@latest` in a
   terminal (pnpm: `pnpm dlx create-feedbax@latest`, bun: `bunx create-feedbax@latest`).
   Keep the defaults: Notion template, anonymous feedback on, no sign-in
   provider. Do not add GitHub, email, webhooks or logins unless I ask. They
   are add-ons.

2. Ask me only for what only I can provide, once:
   - Project name and product name.
   - Notion: duplicate the template, create an API-token connection (read,
     insert, update) and share the page with it. Check the token can see that
     page before continuing; a token alone does not grant page access.
   - Cloudflare: login happens in the browser. Leave login, MFA and payment
     (R2, paid plans) to me.
   Use secure secret input. Never put secrets in arguments, chat, logs or Git.

3. I authorize the Cloudflare resources for this portal and deploying to the
   account I select. Follow the CLI's R2 and workers.dev prompts. If setup
   stops, fix the problem and rerun the same command in the same folder. Run
   `npx feedbax@latest doctor` if something looks wrong. Without a terminal,
   use --yes with NOTION_TOKEN, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
   (plus --notion-page if no unique Feedbax database is visible).

4. Verify the live URL and /api/health: submit a labeled test post and confirm
   it reaches Notion. Delete only the test data you created
   (`npx feedbax@latest admin`, then Moderation).

Finish by printing the portal URL, the `npx feedbax@latest admin` sign-in link,
the Notion URL, the project folder and any remaining manual steps. Mark
anything untested.
```

## Quick start by hand

You need **Node 24.15 or newer 24.x**, a Notion workspace you own and a [free Cloudflare account](https://dash.cloudflare.com/sign-up). Anonymous feedback is on. No sign-in provider is installed.

1. Open [the Feedbax template](https://brave-number-c98.notion.site/Feedbax-418afe159691807c8805db7a942aedcc) in Notion and click **Duplicate**.
2. Create a token at [Developer connections](https://app.notion.com/developers/connections) (**New connection → API token**) and [share the page with it](#notion-access).
3. Run `npx create-feedbax@latest` (pnpm: `pnpm dlx create-feedbax@latest`, bun: `bunx create-feedbax@latest`).
4. Pick a project name, paste the token (the CLI calls it the **Notion secret**) and log in to Cloudflare in the browser.
5. Open the printed portal URL, submit a post and confirm it reaches Notion within about 5 minutes.
6. Run `npx feedbax@latest admin` from the project and open the link to moderate.

Add sign-in, GitHub, email and webhooks after the portal is live.

### Notion access

- **Duplicate missing?** Sign in to Notion and reopen the link ([Notion's guide](https://www.notion.com/help/duplicate-public-pages)). To skip the template, use a page you own and let setup create the database.
- **Token:** select your workspace and allow reading, inserting and updating content. Creating the token does not share the page.
- **Share the page** (the duplicate, or the page where setup should create the database) one of these ways:
  - **On the page:** **•••** (top right) → **Connections** → your integration → **Confirm**. In the current app: **Actions → More → Connections → Add connections**.
  - **From settings:** **Settings → Connections → Develop or manage integrations →** your integration → **Access** (sometimes **Content access**) → **Edit access** → tick the page → **Save**.
- Pick the page in your workspace. If names repeat, check its location. Confirm the page is listed, not **No page access**. If the page menu only shows **Connections — None**, use the settings route. [Notion's connection guide](https://www.notion.com/help/add-and-manage-connections-with-the-api).
- If setup cannot see the page, the integration is not connected yet. `app.notion.com/p/…` links are accepted. Setup finds the database, or offers **Paste a page link** and **I just shared one — search again**.

### Setup details

- Enable R2 if the CLI asks: open the printed Cloudflare link, click **Enable R2** (the free tier needs a payment method), then press Enter. Pick a **workers.dev** subdomain if you do not have one.
- If setup stops, fix the reported problem and rerun the same command in the same folder. Answer yes to **Finish setting up …?** to resume.
- For CI or an agent, set the three credentials and pass `--yes` (no prompts, no browser):

  ```sh
  NOTION_TOKEN=… CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
    npx create-feedbax@latest my-feedback --yes
  ```

- If the integration sees no unique Feedbax database, add `--notion-page <page-id-or-url>` for a page you shared. Run `npx create-feedbax@latest --help` for every flag. Do not put secrets in flags.

## Triage in Notion

1. Change **Status** (or drag the card on the board): Open, Planned, In progress, Done or Closed. Allow about 5 minutes.
2. **Done** means delivered. **Closed** means declined, duplicate or out of scope. Done and Closed posts appear after active ones.
3. Sort by **Priority** and **Votes** to pick what to build next. Set scores in the optional **Priority** property ([Priority scores](#priority-scores)).
4. Keep the property names and types from the [template](#quick-start-by-hand). Extra properties and views are fine. Feedbax writes the author, counts and links. Your team changes Status and Send to GitHub.

## Ship with GitHub and the changelog

### Add GitHub issue sync

Tick **Send to GitHub** on a Notion post to open one issue. Closing the issue marks the post **Done**; reopening it does not undo that. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new?name=Feedbax&description=Feedbax+issue+sync&issues=write): **Only select repositories**, your repo, **Issues → Read and write**. This token is not the GitHub login credential.

```sh
npx feedbax@latest add github
GITHUB_TOKEN=… npx feedbax@latest add github --repo owner/repo --yes
```

The command checks that the repo exists and Issues is enabled, then sets `GITHUB_TOKEN` and `integrations.github`.

- Changing Status does not create an issue. Unticking later does nothing.
- Use **Send to GitHub** on public posts only. Hidden, spam, merged and deleted posts are skipped; their checkbox stays unchanged, and restoring a post resumes its approval.

### Changelog from GitHub releases

1. Configure GitHub sync for your repository; for private repositories, give the existing token **Contents: read** access too.
2. Choose **Admin → Settings → Changelog → Changelog source → GitHub releases**, then save.
3. Publish or edit a non-draft, non-prerelease GitHub release. Its notes appear on `/changelog`, and linked issues (`Closes #123`, `#123`, or same-repository issue URLs) link their posts and mark them Done.

Reconciliation needs no webhook setup: it checks one page of five releases per hour using ETags (large histories backfill over several hours). For immediate updates, optionally subscribe a repository webhook to **Releases** at `https://<portal>/api/webhooks/github`, using a random secret stored as `GITHUB_WEBHOOK_SECRET`. Deleted, unpublished, draft and prerelease entries disappear from the public changelog. Imported entries are read-only in the portal; use **Edit on GitHub**. Existing portal entries remain editable. Release notes use the portal's safe Markdown subset (up to 20,000 characters); titles use up to 200 characters. Each release sends publication notifications once, including during initial backfill.

## Moderate

Run `npx feedbax@latest admin` from the project. It prints a sign-in link that works once and expires after 15 minutes. Open it, confirm, and you land on `/admin/moderation`. No sign-in provider is required. A signed-in admin sees **Admin** in the header. Everyone else gets "not found" for `/admin`.

- **Moderation** lists posts and comments. Sort posts by newest or Priority, and click a post's vote count (or **View voters** on the post page) to inspect who voted on it. Hide or restore a post, mark spam, merge a duplicate (votes move, one per person), send a post to GitHub, or delete a post or comment. Deleting a post removes its images and archives its Notion row.
- **Insights** (`/admin/insights`) shows feedback volume, votes cast, median response and delivery times, status and category breakdowns, the most voted open requests, and active signed-in contributors over the last 7, 30 or 90 days. Counts exclude hidden, spam, and merged posts; anonymous and banned accounts are excluded from contributor rankings. Response and delivery times count from 0.3.2 onward. Numbers refresh at most every 5 minutes.
- **Users** lists people, with search. Ban or unban them. Grant or revoke admin.
- **Settings** changes the portal name, anonymous feedback, categories and notification switches without a redeploy. Secrets are not shown.

Anonymous feedback, notification, changelog, webhook and email switches save immediately. If a switch cannot save, retry after it returns to its last saved value; your latest choice stays visible while saving.

### Profanity filter

1. Open **Settings → Profanity filter** and choose **Flag for review** (default), **Block**, or **Off**.
2. Add custom blocked or allowed words (one per line). Use **Save changes** after editing the portal name, categories or profanity filter.
3. Review feedback marked **Reason: profanity** in **Moderation**; unhide a post or approve a comment to publish it.

The English word list runs locally without a service or fee. It checks post titles, descriptions and comments; admins bypass it. Flagged feedback stays out of public lists, counts, reply emails and webhooks. If a moderation provider fails or times out, posting stays available and a content-free warning is logged. This is a word filter, so review context before approving or removing feedback.

### Duplicate detection

While someone types a post title, Feedbax shows similar public posts and suggests a post type. Admins can review groups of similar open posts under **Moderation → Similar groups** and merge a duplicate into the suggested post. It all runs on your portal: no setup, no key, no external calls.

### Priority scores

1. Open a post as an admin or go to **Admin → Moderation**, enter a **Priority** from 0–100, then **Save**. Choose **Clear**, then **Save** to remove it.
2. Choose **Priority** on the board or moderation list to see highest scores first; unscored posts follow. Only admins see this sort or the score.
3. To edit scores in Notion, use the optional **Priority** number property (0–100, or empty). Changes sync both ways; databases without it keep syncing normally.

### Hidden posts

Hidden, spam and merged posts leave the board, roadmap and search. Authors still see them under **My feedback**. Hide or mark spam to restrict attachments to the author and admins; merged attachments are admin-only, and deleted attachments return 404. Restore a post to resume syncing; Feedbax restores only Notion mirrors it archived, and never mirrors new non-public posts. Moderation pauses GitHub approval without changing the Notion checkbox.

Public images cache for at most 60 seconds; `/changelog.rss` caches for up to 5 minutes (`public, max-age=300`) with `ETag`/`304` revalidation that invalidates immediately when entries or linked post visibility change; session responses are private and revalidate each time. ETags avoid repeat R2 reads and repeat XML/Markdown renders. Older releases' cached browser copies cannot be recalled. Queued webhooks recheck visibility before every attempt, RSS omits non-public linked posts, and OG images contain no post data. Changelog titles and release notes are independent editorial content; edit them separately if they contain sensitive text.

## Add-ons

Each add-on is optional. Run it from the project folder. It validates inputs and checks provider access before changing anything, writes config, sets Cloudflare secrets and offers to redeploy. If a later step fails, it lists changed files and secret names with a recovery command. Secrets come from masked prompts or environment variables, never flags. `--yes` never prompts: set the variables below and pass the flag. `npx feedbax add --help` lists them. GitHub issue sync is [above](#add-github-issue-sync).

Projects created before 0.3.1 have no local `feedbax` package. Keep using `npx feedbax@latest`.

### Add GitHub login

Create an **OAuth App** at [GitHub Developer settings](https://github.com/settings/applications/new). The command prints the homepage and callback (`<portal URL>/api/auth/callback/github`). These credentials are not the Issues token.

```sh
npx feedbax@latest add github-login
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… npx feedbax@latest add github-login --yes
```

### Add Google login

Create a Web application OAuth client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials). The command prints the origin and redirect URI (`<portal URL>/api/auth/callback/google`). Finish Google's consent-screen requirements.

```sh
npx feedbax@latest add google-login
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npx feedbax@latest add google-login --yes
```

### Add login from your own app

Signed-in users of your app can send feedback without a second login. This sets `appUrl` and stores `FEEDBAX_HOST_SECRET` in Cloudflare. It does not rotate an existing secret.

```sh
npx feedbax@latest add host-login
npx feedbax@latest add host-login --app-url https://app.example.com --yes
```

Then [add the feedback dialog](#add-the-feedback-dialog-to-your-app). Until the token endpoint works, people can browse but cannot sign in through your app.

### Add email notifications

People with a known email (GitHub, Google or host login) are emailed when a post they follow (by posting, voting, commenting, or clicking **Follow**) changes status, or someone comments on a followed post or replies to their comment. Anonymous users get none. Every email includes a one-click unfollow link for that post alongside a category unsubscribe. Sending uses [Resend](https://resend.com/api-keys). Verify the domain at [resend.com/domains](https://resend.com/domains). Without a key and a from-address, email stays off.

```sh
npx feedbax@latest add email
RESEND_API_KEY=… npx feedbax@latest add email --from "Feedbax <feedback@example.com>" --yes
```

This sets `RESEND_API_KEY` and `notifications.email.from`. Remove `notifications.email` from `feedbax.config.ts` to turn email off. Deliveries retry temporary failures and continue large audiences in small slices. Completed recipients are skipped on redelivery; unsubscribes are checked before each send. If a send remains uncertain for 24 hours, it is recorded as `idempotency_expired` rather than replayed outside Resend’s deduplication window.

### Add webhooks

Endpoints are managed in the portal, not in files or secrets. `npx feedbax@latest add webhooks` only prints these steps:

1. Run `npx feedbax@latest admin` and open the link.
2. Open `/admin/settings` → **Webhooks** and add an endpoint URL.
3. Copy the signing secret. Each request has `X-Feedbax-Signature: t=<unix seconds>,v1=<hex>`. `v1` is HMAC-SHA256 of `"<t>.<raw body>"` with that secret. Verify it and reject old timestamps.

Events: `post.created`, `post.status_changed`, `comment.created`, `vote.created`, `changelog.published`. Bodies are Markdown plus plain text. Open **Event catalog** on the same screen for schemas and example payloads. Failed deliveries retry with backoff (6 attempts over about 7 hours) and unqueued deliveries recover automatically. Filter recent deliveries by status or endpoint, inspect payloads, and replay failed deliveries.

## Add the feedback dialog to your app

Signed-in users send feedback, including an annotated screenshot, without a second login. Your app needs React and shadcn/ui (CLI 4.7 or newer). Run [`add host-login`](#add-login-from-your-own-app) first.

**1. Install the block.**

```sh
npx shadcn@latest add https://raw.githubusercontent.com/jessequartey/feedbax/main/public/r/feedbax-feedback.json
```

To install by name, add this to `components.json`:

```json
{
  "registries": {
    "@feedbax": "https://raw.githubusercontent.com/jessequartey/feedbax/main/public/r/{name}.json"
  }
}
```

```sh
npx shadcn@latest add @feedbax/feedbax-feedback
```

Once Feedbax is in the [shadcn registry directory](https://ui.shadcn.com/docs/registry/registry-index), the `components.json` entry is unnecessary. The block copies components to `components/feedbax/` and helpers to `lib/feedbax/`, using your aliases and theme.

**2. Add a token endpoint.** Copy `FEEDBAX_HOST_SECRET` from the portal's `.dev.vars` into your app's server environment. Do not change the generated value. Import `token.server` only on the server.

`getSessionUser` must read your session, never the request body, and return `{ id, name, isAnonymous }` or `null`. Set `isAnonymous` from your auth system's guest flag. Only a registered signed-in user returns `false`. Replace `https://app.example.com` with your app's origin (localhost for development).

Web handler, `POST /api/feedbax-token`:

```ts
import { mintFeedbaxToken } from "@/lib/feedbax/token.server";

const APP_ORIGIN = "https://app.example.com";

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("Origin") !== APP_ORIGIN) {
    return new Response("Forbidden", { status: 403 });
  }
  const user = await getSessionUser(request); // your own auth
  if (!user || user.isAnonymous !== false) {
    return new Response("Unauthorized", { status: 401 });
  }
  const token = await mintFeedbaxToken({
    secret: process.env.FEEDBAX_HOST_SECRET!,
    user: { id: user.id, name: user.name },
  });
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
```

TanStack Start, `src/routes/api/feedbax-token.ts`: wrap the same checks and `mintFeedbaxToken` call in a server handler.

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/feedbax-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        /* body of POST above */
      },
    },
  },
});
```

On Cloudflare Workers, use `env.FEEDBAX_HOST_SECRET` from `import { env } from "cloudflare:workers"` instead of `process.env`.

Other backends: sign an HS256 JWT. The secret must be canonical unpadded base64url and decode to at least 32 bytes. Keep the generated value unchanged on both servers. Header `{"alg":"HS256","typ":"JWT"}`. Claims: `sub` (stable user id, 1–200 Unicode code points, no line separators), `name` (1–80), `exp` (at most 5 minutes ahead), `jti` (fresh UUID). `sub` and `name` must contain non-whitespace text. Each token works once.

**3. Render the dialog and link.** The component is `FeedbaxDialog`.

```tsx
import { FeedbaxDialog } from "@/components/feedbax/feedback-dialog";
import { FeedbaxLink } from "@/components/feedbax/feedbax-link";

<FeedbaxDialog portalUrl="https://feedback.example.com" />

<FeedbaxLink portalUrl="https://feedback.example.com">
  Go to feedback
</FeedbaxLink>
```

Use your portal URL. `npx feedbax@latest add host-login --app-url <your app URL>` (or `appUrl` in `feedbax.config.ts`, then redeploy) allows that origin and adds **Back to app**. `FeedbaxLink` asks the user to confirm the account. **Continue** signs them in and opens the board. Opening the link does not switch accounts or transfer anonymous feedback. Host identities and portal accounts stay separate. The block requires a signed-in host user.

| `FeedbaxDialog` prop   | Default              | Purpose                                                  |
| ---------------------- | -------------------- | -------------------------------------------------------- |
| `portalUrl`            | required             | Your portal's origin                                     |
| `tokenUrl`             | `/api/feedbax-token` | Your token route                                         |
| `getToken`             | none                 | Override with `() => Promise<{ token: string }>`         |
| `trigger`              | Feedback button      | Custom element, or `null` for controlled use             |
| `redirectOnSubmit`     | `true`               | Open the new post; `false` shows a View your post button |
| `onSubmitted`          | none                 | Receives `{ postId, postUrl }`                           |
| `open`, `onOpenChange` | none                 | Controlled state                                         |

`FeedbaxLink` accepts `portalUrl`, `tokenUrl`, `getToken`, `children`, `to` (`/` or `/posts/<id>`) and `target` (`_self` or `_blank`).

**Screenshots.** The default captures the page DOM. Cross-origin images without CORS, iframes, video and some CSS may look wrong or blank. Sticky headers may shift. Mark elements with `data-feedbax-ignore` to exclude them. **Capture screen instead…** uses the browser screen picker where it exists. Upload, paste (⌘/Ctrl+V) and drag-and-drop also work. Capture does not start by itself and does not attach the page URL. Users can annotate and hide sensitive information before sending.

## Upgrade and CLI

Run these from the generated project. `npx create-feedbax@latest --help` and `npx feedbax@latest --help` list every flag.

```sh
npx feedbax@latest migrate   # upgrade to the latest release
npx feedbax@latest add       # github | github-login | google-login | host-login | email | webhooks
npx feedbax@latest doctor    # check config, secrets, bindings and /api/health
npx feedbax@latest deploy    # build, migrate production D1, deploy
npx feedbax@latest admin     # print the admin sign-in link
```

Locally, `npm run dev` serves http://localhost:3000. `npm run deploy` does what `deploy` does.

Local data is separate from production, but local posts sync to your real Notion database when `NOTION_TOKEN` is set. Delete test rows afterwards. For a custom domain, update the route in `wrangler.jsonc` and `PORTAL_URL` together, then deploy. Edit `feedbax.config.ts` and redeploy to change options. Conflicting setup flags stop and explain. They do not overwrite your config. Deploy applies additive migrations and keeps existing data. Running create-feedbax again resumes setup. It does not upgrade an existing project.

### Update to a new release

```sh
npx feedbax@latest migrate --dry-run   # print the plan, change nothing
npx feedbax@latest migrate             # upgrade to the latest release
npx feedbax@latest migrate 0.3.2       # or a specific version
```

`migrate` downloads the published `create-feedbax` template for your version and the target, then merges upstream changes into your files. After you confirm, it installs dependencies if they changed, creates any missing notification queue, applies new D1 migrations and deploys. `--yes` confirms every step.

- **Clean tree.** It refuses uncommitted changes, and it refuses a folder that is not a Git repository. Commit first, or pass `--force`.
- **Conflicts.** Where you and upstream edited the same lines, it writes conflict markers, lists the files and stops before install, migrate or deploy. Resolve them, run your checks, then rerun `npx feedbax migrate`.
- **Protected.** It does not change your `feedbax.config.ts` values, `wrangler.jsonc` resource IDs, names, routes and vars, `.dev.vars`, `.env*`, or Cloudflare secrets. Required structural edits to those files keep your values.
- **Resume.** Rerun `npx feedbax migrate` after a failure or interruption, including queue provisioning. Progress is saved in `.feedbax/`; completed steps are skipped, and `--dry-run` lists the remaining steps. The installed version advances only after queue provisioning, migrations and deploy succeed.
- **Baseline.** The installed version is `.feedbax/version`. A 0.3.0 project has no such file. It is detected from `package.json`. Because 0.3.0 does not depend on `feedbax`, run `npx feedbax@latest migrate`. If detection fails, pass `--baseline <version>` with the `create-feedbax` version you started from.

There is no migration from 0.2.x. Start a new project. See [CHANGELOG.md](CHANGELOG.md).

## Configuration

Edit `feedbax.config.ts`, then run `npm run deploy`.

```ts
import { defineConfig } from "./src/contracts/config.ts";

export default defineConfig({
  name: "My feedback",
  appUrl: "https://app.example.com", // optional: Back to app and allowed host origin
  auth: { anonymous: true }, // setup default; false requires a sign-in provider to post, comment and vote
  notifications: { email: { from: "Feedbax <feedback@example.com>" } }, // optional, or false. Needs RESEND_API_KEY
  integrations: {
    notion: { dataSourceId: "…" }, // keep the value setup generated
    github: false, // or { repo: "owner/repo" }, with GITHUB_TOKEN set
  },
});
```

Add-on commands edit `appUrl`, `notifications.email` and `integrations.github`. `appUrl` must be an absolute https URL. http is allowed for localhost. Omit it for a standalone portal. GitHub issue sync and **Sign in with GitHub** are separate.

**Link previews.** Shared links use `public/og.png` (1200×600) on X, Facebook, LinkedIn, Slack and Discord. Replace that file with your own PNG at the same size. The card uses `name` from `feedbax.config.ts` and `PORTAL_URL` in `wrangler.jsonc`, both read at build time. Run `npm run deploy` after changing either. Crawlers need an absolute https URL. A localhost `PORTAL_URL` falls back to a relative `/og.png`.

| Secret or variable                         | Purpose                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `PORTAL_URL`                               | Portal URL. Setup writes it to `wrangler.jsonc` and `.dev.vars`      |
| `BETTER_AUTH_SECRET`                       | Generated by setup                                                   |
| `FEEDBAX_HOST_SECRET`                      | Generated by setup. Copy to your app's server for the dialog         |
| `NOTION_TOKEN`                             | Notion connection API token                                          |
| `GITHUB_TOKEN`                             | Optional issue sync. Fine-grained token, Issues read/write, one repo |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub login. Both required when selected                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login. Both required when selected                            |
| `RESEND_API_KEY`                           | Optional email. Also needs `notifications.email.from`                |

Secrets live in git-ignored `.dev.vars` locally and in Cloudflare secrets in production. Do not put them in `VITE_*` or `feedbax.config.ts`. To set or rotate one in production:

```sh
npx wrangler secret put NOTION_TOKEN
```

Anonymous participation is the default (`auth.anonymous`). Email/password login is disabled. Existing account data is kept. Social identities are not linked to an old account by email.

For OAuth, set both values of a provider. An incomplete pair stops startup. Register `<portal URL>/api/auth/callback/github` or `/api/auth/callback/google`. See [GitHub's OAuth App guide](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). An Issues token does not enable login. Confirm login with a real callback, then submit feedback. **Back to app** does not sign anyone in. Social and host login can both be on.

For local OAuth, use a separate development app with `http://localhost:3000/api/auth/callback/github` (or `/google`). Put those credentials in `.dev.vars`. Leave the production callback and Cloudflare secrets unchanged. Editing `.dev.vars` does not rotate a production secret.

When resuming `create-feedbax` with `--login`, confirm saved OAuth credentials match the printed production URL. With `--yes`, pass production client id and secret in the environment for every configured provider. Setup will not upload saved development credentials without confirmation.

## Theming

Pick a preset at [shadcn Create](https://ui.shadcn.com/create). These commands use Feedbax's default. Replace `buFyyzw` with your code.

```sh
npx shadcn@latest apply --preset buFyyzw --only theme  # colors only
npx shadcn@latest apply --preset buFyyzw               # full style
```

Redeploy afterwards. The dialog follows your app's theme.

## How it works

```text
People → Cloudflare portal → D1 (source of truth)
                               │ sync every 5 minutes
                               ▼
                         Notion dashboard
                               │ “Send to GitHub” checked
                               ▼
                           GitHub issue
```

Images live in R2. The portal keeps working if Notion or GitHub is down. Sync catches up later. Posts and images are public as soon as they are submitted.

Votes update on the portal immediately. **Trending** ranks posts by recent votes over the last 7 days with recency weighting. Bursts are combined before Notion sync. Each user can change a vote up to 10 times in 10 seconds and 120 times an hour. Repeating the same vote does not count again.

## Browse and write feedback

1. Click a post on **Feedback** or **Roadmap** to read it in a dialog; on phones it fills the screen.
2. Press **Back**, **Escape** or **Close** to return to the same filters, page and scroll position.
3. Copy the post URL, open it in a new tab, reload, or choose **Open full page** to read the full page.
4. Choose **New post** to write in a dialog, or open `/submit` for the full page; **Open full page** keeps your title, description and post type. Images stay in the current form and must be reattached after switching views.
5. Open a post and focus **Add a comment** to load the formatting tools, or open **Create post** and focus its description. Start typing immediately; your text stays in place while the editor loads. If it cannot load, keep writing in the textarea using Markdown.

## Search

1. Press **Cmd/Ctrl+K** or click a search box to search feedback and changelog.
2. Type words to search; leave it empty for top posts and recent releases.
3. Use **↑ / ↓** and **Enter** to open a result, or **Esc** to close.

## Free plan

Feedbax targets Cloudflare's Free plan: one Worker, one D1 database, one R2 bucket, two Queues and a Cron trigger. Browser caching, conditional ETags, and per-isolate RSS XML caching avoid repeat image reads and Markdown renders (`1` D1 query on RSS cache hits and `304` revalidations). Post detail, portal, changelog, moderation, and user lists batch D1 reads into single round-trips backed by covering and partial indexes. Idle sync checks Notion every 5 minutes and skips GitHub when no linked issue needs checking. Failures back off. Moderation adds no idle cron statements or provider calls; cleanup runs only for changed mirrors in the queue.

With GitHub configured, the changelog adds one settings read per five-minute cron tick, no HTTP calls and no new bindings. Once per 12 ticks it queues one conditional GitHub request; an unchanged page costs two consumer reads and three writes (error clear, visibility reconcile, checkpoint), with no publication notifications. GitHub's existing issue sync costs are unchanged.

Email and webhooks use `<name>-notify`; Notion and GitHub use `<name>-sync`. Run `npx feedbax@latest migrate` to add the notification queue to an existing project; deliveries use the sync queue until then. The split adds no D1 statements or queue messages per idle cron tick. Queues includes 10,000 operations/day on Free: a delivered message up to 64 KB uses three operations (write, read, delete), plus one read per retry. Moving deliveries to their own queue does not add operations.

Workers Free allows 10 ms of CPU per HTTP request. Some measured social, host-login and data requests exceeded that budget. The tested flows still worked. Further CPU optimization is deferred. This release does not guarantee every request fits the Free limit. CPU time is processing time. Waiting on the network is excluded.

Compare your traffic with Cloudflare's [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/) and [R2](https://developers.cloudflare.com/r2/pricing/) limits. R2 activation may require a payment method even when usage stays inside the free allowance.

## Troubleshooting

Run `npx feedbax@latest doctor` first. It checks config, Cloudflare secrets and bindings, `/api/health`, Notion access and GitHub access when GitHub is enabled, and prints a fix for each failure. `/api/health` reports `notion`, `github` and `email` as `ok`, `failing` or `off`. For logs, run `npx wrangler tail` or open Workers Logs.

If one post stops syncing because its Notion row was trashed, restore that row. Other posts keep syncing. A later poll reconnects the restored row. Feedbax does not recreate it. Unexpected HTTP errors include `X-Request-ID`. Use it with Workers Logs. Keep secrets out of bug reports.

| Problem                                       | Fix                                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “check you copied the whole secret”           | Copy the full Notion API token, with no spaces or line breaks.                                                                                                                                                                                 |
| Setup can't see your page/database            | Recheck both access routes in [Notion access](#notion-access), then choose **I just shared one — search again** or paste the page link. Search can lag. If settings still say **No page access**, ask the workspace owner to connect the page. |
| Public template missing or shows “No results” | Continue with a blank page you own: connect it as in [Notion access](#notion-access) and let setup create the database. Report the template link on [GitHub issues](https://github.com/jessequartey/feedbax/issues).                           |
| “R2 isn't enabled on this account”            | Follow the CLI link, click **Enable R2**, then press Enter. A payment method is required on the free tier.                                                                                                                                     |
| workers.dev subdomain fails                   | Pick another name, or follow the CLI's Workers & Pages link and press Enter when ready.                                                                                                                                                        |
| Resource name already exists                  | Choose another project name. `<name>-db`, `<name>-images`, `<name>-sync` and `<name>-notify` must be unused.                                                                                                                                   |
| Setup stopped halfway                         | Rerun the same command and accept **Finish setting up …?** Secrets and resources are reused.                                                                                                                                                   |
| GitHub repo rejected                          | Use `owner/repo`, enable Issues, unarchive the repo, and give the token Issues read/write. Then rerun `npx feedbax@latest add github`.                                                                                                         |
| GitHub/Google sign-in fails                   | Check both OAuth credentials and the exact deployed callback. An Issues token does not enable login. For Google, also check consent-screen publishing and test users.                                                                          |
| Sign-in isn't configured                      | Run `npx feedbax@latest add github-login`, `google-login` or `host-login` (host login also needs the token endpoint). Or set `auth.anonymous`. Email/password login is disabled.                                                               |
| Notion sync fails                             | Check page access and the required property names and types. Restore them and wait for the next sync.                                                                                                                                          |
| No GitHub issue                               | Tick **Send to GitHub** in Notion and allow 5 minutes. Check `/api/health`.                                                                                                                                                                    |
| Dialog gets 401 / expired link                | Tokens last 5 minutes and work once. Retry. Confirm the host secrets match and the server clock is correct.                                                                                                                                    |
| Dialog blocked by CORS                        | Set `appUrl` to your app's exact origin and redeploy.                                                                                                                                                                                          |

## Community templates

Share a Notion layout or find others in [TEMPLATES.md](TEMPLATES.md).

## Contributing

Bug reports, fixes and templates are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
