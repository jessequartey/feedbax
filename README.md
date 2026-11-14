<img src="docs/hero.png" alt="Feedbax feedback board and Notion dashboard" width="100%" />

# Feedbax

A self-hosted feedback portal: collect ideas, votes and comments, triage in Notion, and turn approved posts into GitHub issues.

[![npm version](https://img.shields.io/npm/v/create-feedbax.svg)](https://www.npmjs.com/package/create-feedbax)
[![license](https://img.shields.io/npm/l/create-feedbax.svg)](LICENSE)

[Try the demo](https://feedbax.juutech.africa)

## Get started

You need **Node 24.15 or newer 24.x**, a Notion workspace where you are an **owner**, and a [free Cloudflare account](https://dash.cloudflare.com/sign-up).

1. **Duplicate the Notion template.** Sign in to Notion in your browser, then open [the Feedbax template](https://brave-number-c98.notion.site/Feedbax-418afe159691807c8805db7a942aedcc). Click **Duplicate** (the overlapping-pages icon at the top right) and choose your workspace. If it is missing, check that you're signed in and reopen the link ([Notion's guide](https://www.notion.com/help/duplicate-public-pages)). You can also skip the template: setup can create a database on a page you own.

2. **Create a Notion connection and give it page access.** Open [Developer connections](https://app.notion.com/developers/connections), choose **New connection → API token**, select your workspace and copy its token. The CLI calls this your **Notion secret**. Allow reading, inserting and updating content.

   Connect it to your duplicated page (or the page where setup should create the database) using either route:

   - **On the page:** **•••** (top right) → **Connections** → search your integration → **Confirm**. In the current app, look under **Actions → More → Connections → Add connections**.
   - **From settings:** **Settings → Connections → Develop or manage integrations →** your integration → **Access** tab → **Edit access** → tick the page → **Save**. Some screens label the tab **Content access**; the developer link may open **Developer connections**.

   Select the parent page in your workspace, checking its location if names repeat. Reopen access settings to check that the page is listed, rather than **No page access**. If the page menu only shows **Connections — None**, try the settings route. [Notion's connection guide](https://www.notion.com/help/add-and-manage-connections-with-the-api) covers workspace permissions.

   **If setup says it can't see your page, the integration isn't connected yet.** Setup accepts `app.notion.com/p/…` page links too.

3. **Optional: create a GitHub Issues token.** For the **Notion + GitHub** template, open [the token form](https://github.com/settings/personal-access-tokens/new?name=Feedbax&description=Feedbax+issue+sync&issues=write). Choose **Only select repositories**, pick your repository, and set **Issues → Read and write**. Copy the generated token. Skip this for **Notion** only. This token is separate from GitHub sign-in.

4. **Run setup.** Choose one command:

   ```sh
   npx create-feedbax@latest
   ```

   ```sh
   pnpm dlx create-feedbax@latest
   ```

   ```sh
   bunx create-feedbax@latest
   ```

   Choose your project name, content template, sign-in method and whether to allow anonymous feedback. **GitHub login is recommended**; Google and your app's existing login are also supported. Provide your Notion integration secret and, for issue sync, the separate GitHub Issues token. Setup finds your database, or offers **Paste a page link** and **I just shared one — search again**. Log in to Cloudflare when the browser opens.

   R2 needs enabling once. If needed, the CLI says: “R2 isn't enabled on this account. Open https://dash.cloudflare.com/?to=/:account/r2/overview and click Enable R2 (the free tier needs a payment method on file). Press Enter when done.” It also asks **Pick your workers.dev subdomain** if you don't have one.

   Once setup knows your portal URL, it prints the exact OAuth homepage and callback to register. For GitHub login, create an **OAuth App** at [GitHub Developer settings](https://github.com/settings/applications/new), then enter its client ID and client secret in the CLI. These are not your Issues token. For Google, use a Web application OAuth client with the printed redirect URI and complete Google's consent-screen requirements. For your app's existing login, provide its real HTTPS URL and finish the [host integration](#add-the-feedback-dialog-to-your-app).

5. **Verify your portal.** Setup creates storage, applies migrations and prints your deployed URL. Open it, complete the selected sign-in flow and submit a post; it should reach Notion within about 5 minutes. Host-only setup lets people browse immediately, but signed-in participation needs the host integration before it is ready. If setup stops, fix the reported problem and rerun the same command from the same folder. Answer yes to **Finish setting up …?** to resume.

## Set up with an agent

Copy the prompt below into your coding agent. An agent with a terminal and computer use can handle the account setup with your permission, run the CLI and verify the deployed portal. Keep tokens in the agent's secure secret input or local environment, rather than pasting them into chat. You handle sign-in, MFA and any payment details yourself.

<details>
<summary>Copy this setup prompt</summary>

```text
Set up and deploy Feedbax for me, then verify it works end to end.
Read https://github.com/jessequartey/feedbax#readme first and follow
its current instructions. Run npx create-feedbax@latest --help for supported
options; use the published create-feedbax package to create the app.

My preferences (ask once for anything missing):
- Parent folder and project name: [where to create the project]
- Template: [Notion / Notion + GitHub]
- Sign-in: [GitHub (default) / Google / my app's existing login]
- Product name and app URL: [name; URL for Back to app, or standalone]
- Host project folder, if using its existing login: [folder; real HTTPS app URL]
- GitHub repository, if selected: [owner/repo]
- Anonymous feedback: false unless I choose otherwise.
- Package manager: use my existing choice, otherwise npm.

I authorize creating the resources needed for this portal and deploying
to the Cloudflare account I select. Ask once for permission before
using my signed-in browser sessions to manage Notion connections,
GitHub tokens or Cloudflare settings. Reuse permission I have already
given. If browser access is unavailable or declined, give me the exact
manual step and continue the work that does not depend on it. Leave
login, MFA and payment entry to me; use secure secret-input tools when
you need a credential only I can provide.

1. Check the destination folder, Node requirement and package manager.
   Preserve existing files. Agree on the account/workspace and the
   preferences above before creating remote resources. If setup was
   interrupted, inspect and resume that project instead of duplicating
   its resources. Complete each step below; report blockers precisely.

2. Set up Notion. With browser permission, sign in, open the official
   template linked in the README, click its top-right overlapping-pages
   Duplicate icon and choose my workspace. Name the duplicate for this
   project. Reuse an existing intended copy if present. Create a project
   API-token connection, or reuse one I approve, with read/insert/update
   access to this page. Follow the README's page-menu or settings route
   to grant access. Verify the token can see the intended page and
   Feedbax database through the API before continuing. Creating a token
   alone does not grant page access. If both sharing routes fail, tell
   me the exact page and connection to link, then recheck the API after
   my action. Keep the official source template unchanged. Remove only
   the known Example rows from my new deployment copy. If I prefer no
   template, share an empty page and let the CLI create its database.

3. For Notion + GitHub, verify the intended repository and enabled
   Issues. With permission, create a fine-grained token limited to that
   repository, with Issues read/write and Metadata read. Use a 90-day
   expiry unless my account policy requires another. Reuse an approved token;
   keep broad personal/gh credentials out of the generated app.
   Skip this step for Notion only.

4. Run npx create-feedbax@latest from the selected parent folder (or the
   README's pnpm/bun equivalent). Prefer its interactive flow with a
   real terminal so Cloudflare browser login can work. Use --yes only
   when non-interactive setup is necessary: it never prompts or opens
   a browser and requires NOTION_TOKEN, CLOUDFLARE_API_TOKEN and
   CLOUDFLARE_ACCOUNT_ID, plus GITHUB_TOKEN and --github-repo for
   notion-github. It also requires the selected provider's complete
   OAuth client ID/secret pair, or host login with a real HTTPS app URL.
   Supply --login, --app-url and other choices using current --help.
   Secrets belong in secure inputs
   or environment variables, never command arguments, chat, logs,
   screenshots or Git. Preserve the generated secrets and restricted
   .dev.vars permissions.

5. Confirm the intended Cloudflare account. After the CLI determines
   the effective portal origin, register the chosen provider's OAuth
   application using the exact homepage and callback it prints. Keep
   GitHub OAuth client credentials separate from the Issues token.
   With browser permission, complete provider setup; leave account
   reauthentication to me. Collect credentials through secure input
   (T3's request_secret when available) or protected local files. Check
   Google's consent/test-user/publishing requirements when selected.
   Preserve an existing canonical domain and working credentials.
   Let the CLI provision its Worker, D1 database, R2 bucket, Queue and Cron, apply migrations and
   deploy. Follow its R2 enablement and workers.dev subdomain guidance;
   pause for me if payment details or a paid plan would be required.
   Record created resource IDs and the actual portal URL. On failure,
   diagnose and resume the same project; keep its data and secrets.

6. Apply my product name and appUrl in feedbax.config.ts and redeploy
   if changed. Keep my selected social/host login and anonymous choice.
   Feedbax has no email/password login. If using my existing app's login,
   or adding the dialog to it,
   follow the README block instructions: server-only signing secret,
   authenticated same-origin token endpoint, dialog, sign-in link and
   Back to app. Verify the host session before minting each token.
   Report host integration pending until it works from my real app.
   Never derive a signed identity from client-supplied user
   details. Notifications and admin features are roadmap items, with
   nothing to configure today.

7. Verify the live URL and /api/health. Use clearly identified temporary
   test data to complete an actual OAuth callback or host confirmation,
   establish a session, and check a post with an image, voting,
   comments, and the post reaching Notion. Change its Notion status and
   wait for it to reach the portal/roadmap. For GitHub, approve that
   test post, verify one linked issue, close it and verify Done returns
   to the portal and Notion. If installing the host block, also check
   submission, sign-in confirmation, Back to app and token replay
   rejection. Check Cloudflare errors and CPU metrics where available;
   distinguish production measurements from local tests.

8. Remove only the test posts, comments, votes, accounts, images,
   Notion rows and GitHub issues you created for verification, following
   the README cleanup instructions. Preserve all real feedback and the
   running portal's resources. Check the final portal and Notion state.

Finish with the live portal and Notion URLs, project folder, enabled
integrations, verified behavior, exact remaining manual actions and
where secrets are stored (paths/names only). Give me the local dev and
redeploy commands. Mark untested steps honestly; setup is complete only
when the selected integrations and deployed portal have been verified.
```

</details>

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

Images live in R2. The portal keeps working during a Notion or GitHub outage; sync catches up later. Posts and images are public as soon as they're submitted.

- Change **Status** in Notion: Open, Planned, In progress, Done or Closed. **Done** means delivered; **Closed** means declined, duplicate or out of scope. Allow about 5 minutes for changes to appear.
- With GitHub enabled, tick **Send to GitHub** to create one issue. Changing Status alone creates nothing. Unticking later does nothing. Closing the issue marks the post **Done**; reopening it does not undo that.
- Keep the database's property names and types. Extra properties and views are welcome. Feedbax writes the author, counts and links; your team changes Status and Send to GitHub.
- Votes update immediately on the portal; bursts are combined before syncing to Notion. Each user can change their vote up to 10 times in 10 seconds and 120 times an hour. Repeating the same vote does not count again.

## Add the feedback dialog to your app

Let signed-in users send feedback with an annotated screenshot, without a second login. Your app needs React and shadcn/ui (CLI 4.7 or newer).

**1. Install today (works now):**

```sh
npx shadcn@latest add https://raw.githubusercontent.com/jessequartey/feedbax/main/public/r/feedbax-feedback.json
```

**Install by name:** merge this field into your app's `components.json`:

```json
{
  "registries": {
    "@feedbax": "https://raw.githubusercontent.com/jessequartey/feedbax/main/public/r/{name}.json"
  }
}
```

Then run:

```sh
npx shadcn@latest add @feedbax/feedbax-feedback
```

Once Feedbax is listed in the [shadcn registry directory](https://ui.shadcn.com/docs/registry/registry-index), the `components.json` step won't be needed. The block copies components to `components/feedbax/` and helpers to `lib/feedbax/`, using your aliases and theme.

**2. Add a token endpoint on your server.** Copy `FEEDBAX_HOST_SECRET` from the portal's `.dev.vars` into your app's server environment; keep the generated value unchanged. Keep `token.server` imports on the server only.

Adapt `getSessionUser` to your own authentication: it must read the session, never the request body, and return `{ id, name, isAnonymous }` or `null`. Set `isAnonymous` explicitly from your auth system's guest/anonymous flag; only a registered, signed-in user should return `false`. Replace `https://app.example.com` with your app's trusted origin (your localhost origin for development).

A Web handler for `POST /api/feedbax-token`:

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

Or a TanStack Start route at `src/routes/api/feedbax-token.ts`, with the same auth adapter and origin:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { mintFeedbaxToken } from "@/lib/feedbax/token.server";

const APP_ORIGIN = "https://app.example.com";

export const Route = createFileRoute("/api/feedbax-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
      },
    },
  },
});
```

On Cloudflare Workers, use `env.FEEDBAX_HOST_SECRET` from `import { env } from "cloudflare:workers"` instead of `process.env`.

For other backends, sign an HS256 JWT with the base64url-decoded secret. The secret must be canonical, unpadded base64url decoding to at least 32 bytes; keep the generated value unchanged on both servers. Use header `{"alg":"HS256","typ":"JWT"}` and claims `sub` (stable user ID, 1–200 Unicode codepoints, without line separators), `name` (1–80 Unicode codepoints), `exp` (at most 5 minutes ahead) and `jti` (fresh UUID). IDs and names must contain non-whitespace text. Each token works once.

**3. Render the dialog and link.** The exported component is named `FeedbaxDialog`:

```tsx
import { FeedbaxDialog } from "@/components/feedbax/feedback-dialog";
import { FeedbaxLink } from "@/components/feedbax/feedbax-link";

<FeedbaxDialog portalUrl="https://feedback.example.com" />

<FeedbaxLink portalUrl="https://feedback.example.com">
  Go to feedback
</FeedbaxLink>
```

Replace the URL with your portal's. In the portal's `feedbax.config.ts`, set `appUrl` to your app's URL and redeploy. This allows your app's origin to submit and adds **Back to app**. `FeedbaxLink` shows a confirmation naming the account; choose **Continue** to sign in and open the board. Opening the link alone does not switch accounts or transfer anonymous feedback. Host identities and standalone portal accounts are separate; the block always requires a signed-in host user.

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

**Screenshots:** the default captures the page's DOM. Cross-origin images without CORS, iframes, video and some CSS effects may look different or blank; sticky headers may shift. Mark excluded elements with `data-feedbax-ignore`. **Capture screen instead…** uses the browser's screen picker where supported. Upload, paste (⌘/Ctrl+V) and drag-and-drop also work. Capture never starts automatically or attaches your page URL. Users can annotate and hide sensitive information before sending.

## Configuration

Edit your generated `feedbax.config.ts`, then run `npm run deploy`:

```ts
import { defineConfig } from "./src/contracts/config.ts";

export default defineConfig({
  name: "My feedback",
  appUrl: "https://app.example.com", // optional: Back to app and allowed host origin
  auth: { anonymous: false }, // true allows posting, comments and votes without an account
  integrations: {
    notion: { dataSourceId: "…" }, // keep the value setup generated
    github: false, // or { repo: "owner/repo" }, with GITHUB_TOKEN set
  },
});
```

`appUrl` must be an absolute HTTPS URL (HTTP is allowed for localhost). Omit it for a standalone portal. GitHub issue sync and **Sign in with GitHub** are separate; either can be enabled independently.

| Secret or variable                         | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `PORTAL_URL`                               | Portal URL; setup writes this variable to `wrangler.jsonc` and `.dev.vars` |
| `BETTER_AUTH_SECRET`                       | Generated by setup                                                         |
| `FEEDBAX_HOST_SECRET`                      | Generated by setup; copy to your app's server for the dialog               |
| `NOTION_TOKEN`                             | Your Notion connection's API token                                         |
| `GITHUB_TOKEN`                             | Optional issue sync: fine-grained token, Issues read/write for one repo    |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub login; both required when selected                                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login; both required when selected                                  |

Secrets live in git-ignored `.dev.vars` locally and Cloudflare secrets in production. Never put them in `VITE_*` variables or `feedbax.config.ts`. To set or rotate one in production:

```sh
npx wrangler secret put NOTION_TOKEN
```

Feedbax uses **GitHub, Google or your app's existing login**. Email/password login is disabled. Anonymous participation is off by default and can be enabled with `auth.anonymous`. Existing account data is preserved; social identities are not automatically linked to a legacy account by matching email.

For OAuth login, set both values of the provider's pair; an incomplete pair stops startup. Register your portal URL followed by `/api/auth/callback/github` or `/api/auth/callback/google` as the callback. Follow [GitHub's OAuth App registration guide](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) for GitHub login. An Issues token cannot replace these credentials. Provider credentials configure login; verify it by completing a real callback and submitting feedback.

For host login, set `appUrl` and finish the [server token endpoint and sign-in link](#add-the-feedback-dialog-to-your-app). **Back to app** alone does not sign anyone in. Social and host login can coexist.

Use a separate development OAuth app with `http://localhost:3000/api/auth/callback/github` (or `/google`) for local testing. Put its credentials in local `.dev.vars`; keep the production callback and Cloudflare secrets unchanged. Updating `.dev.vars` alone does not rotate a production secret.

When resuming setup, confirm that saved OAuth credentials belong to the printed production URL. With `--yes`, supply production client ID/secret pairs explicitly in the environment for every configured provider; setup refuses to upload saved development credentials without confirmation.

## Theming

Choose a preset at [shadcn Create](https://ui.shadcn.com/create). These commands use Feedbax's default preset; replace `buFyyzw` with your chosen code:

```sh
npx shadcn@latest apply --preset buFyyzw --only theme  # colors only
npx shadcn@latest apply --preset buFyyzw               # full style
```

Redeploy afterwards. The dialog follows your app's theme.

## Deploy and update

From your generated project folder:

```sh
npm run dev      # local portal at http://localhost:3000
npm run deploy   # build, migrate production database, deploy
```

Local data is separate, but local posts sync to your real Notion database if `NOTION_TOKEN` is set. Remove test rows afterwards.

For a custom domain, update the route in `wrangler.jsonc` and `PORTAL_URL` together, then deploy. Updates are source-level in 0.3.0: review and copy upstream changes into your project, keeping your config, resource IDs and secrets. Running create-feedbax again resumes setup; it does not upgrade an existing project. There is no automatic migration from 0.2.x; start a new project (see [CHANGELOG.md](CHANGELOG.md)).

Edit an existing project's options in `feedbax.config.ts` and redeploy. Conflicting setup flags stop with an explanation instead of overwriting your config. The deploy command applies additive migrations while preserving existing data.

**Removing a test or spam post:** there is no moderation screen in 0.3.0. Copy the post's UUID from its portal URL and inspect the matching records first:

```sh
npx wrangler d1 execute DB --remote --command "SELECT id, title, notion_page_id, github_number FROM posts WHERE id = '<post UUID>'; SELECT object_key FROM images WHERE post_id = '<post UUID>'"
```

Keep the image keys, then delete only that post and its dependent rows:

```sh
npx wrangler d1 execute DB --remote --command "DELETE FROM comments WHERE post_id = '<post UUID>'; DELETE FROM votes WHERE post_id = '<post UUID>'; DELETE FROM images WHERE post_id = '<post UUID>'; DELETE FROM posts WHERE id = '<post UUID>'"
```

Move its matching Notion row to Trash and remove any test GitHub issue separately. Deleting database rows leaves image files in R2; delete the saved keys from the project's images bucket in the Cloudflare dashboard. Use these steps for each test post while keeping real feedback.

## Free plan

Feedbax targets Cloudflare's Free plan with one Worker, one D1 database, one R2 bucket, one Queue and a Cron trigger. Browser caching avoids repeat image and asset reads. Idle sync checks Notion every 5 minutes and skips GitHub when no linked issue needs checking; failures back off instead of retrying in a loop.

Workers Free allows 10 ms of CPU per HTTP request. Some measured social/host login and data requests exceeded that budget, even though the tested flows worked. Further CPU optimization is deferred; this release does not guarantee that every request fits the Free limit. CPU time measures processing, excluding time spent waiting for network requests.

Check CPU, request volume, database activity and storage for your traffic against Cloudflare's [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/) and [R2](https://developers.cloudflare.com/r2/pricing/) limits. R2 activation may require a payment method even when usage stays within its free allowance.

## Notifications (coming later)

Nothing to configure today. When notifications ship, you'll add an email provider key and turn them on in `feedbax.config.ts`.
Follow the [roadmap](#roadmap) for updates.

## Roadmap

These features are **Planned**. [Vote on the demo roadmap](https://feedbax.juutech.africa/roadmap) to help prioritize them:

- Admin: manage users
- Webhooks
- Changelog & product updates
- Admin settings
- Email notifications

## Troubleshooting

Open your portal's `/api/health` for `notion` and `github` status (`ok`, `failing` or `off`). For details, run `npx wrangler tail` from your project or open Workers Logs in Cloudflare.

If one post stops syncing after its Notion row was trashed, restore that existing row. Other posts continue syncing; a later poll reconnects the restored row. Feedbax does not recreate or restore it for you. Unexpected HTTP errors include an `X-Request-ID` you can use alongside Workers Logs; keep secrets out of bug reports.

| Problem                                       | Fix                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “check you copied the whole secret”           | Copy the full API token from your Notion connection, without spaces or line breaks.                                                                                                                                                   |
| Setup can't see your page/database            | Recheck both access routes in [step 2](#get-started), then choose **I just shared one — search again** or paste the page link. Search can lag. If settings still say **No page access**, ask the workspace owner to connect the page. |
| Public template missing or shows “No results” | You can continue with a blank page you own: connect it in step 2 and let setup create the database. Report the template link through [GitHub issues](https://github.com/jessequartey/feedbax/issues).                                 |
| “R2 isn't enabled on this account”            | Follow the CLI's link, click **Enable R2**, then press Enter. A payment method is required even on the free tier.                                                                                                                     |
| workers.dev subdomain fails                   | Pick another name, or follow the CLI's Workers & Pages dashboard link and press Enter when ready.                                                                                                                                     |
| Resource name already exists                  | Choose another project name; `<name>-db`, `<name>-images` and `<name>-sync` must be unused for a new project.                                                                                                                         |
| Setup stopped halfway                         | Rerun the same command and accept **Finish setting up …?** Secrets and resources are reused.                                                                                                                                          |
| GitHub repo rejected                          | Use `owner/repo`, enable Issues, unarchive the repo, and give the token Issues read/write for that repo.                                                                                                                              |
| GitHub/Google sign-in fails                   | Check both OAuth client credentials and the exact deployed callback URI. An Issues token does not enable login. For Google, check consent-screen publishing and permitted test users too.                                             |
| Sign-in isn't configured                      | Configure a complete OAuth pair, or finish the host token endpoint with `appUrl` and the shared server-only secret. Email/password login is disabled.                                                                                 |
| Notion sync fails                             | Check page access and required property names/types. Restore them and wait for the next sync.                                                                                                                                         |
| No GitHub issue                               | Tick **Send to GitHub** in Notion and allow 5 minutes; check `/api/health`.                                                                                                                                                           |
| Dialog gets 401 / expired link                | Tokens last 5 minutes and work once. Retry; check that host secrets match and the server clock is correct.                                                                                                                            |
| Dialog blocked by CORS                        | Set `appUrl` to your app's exact origin and redeploy the portal.                                                                                                                                                                      |

## Community templates

Share your own Notion layout or find alternatives in [TEMPLATES.md](TEMPLATES.md).

## Contributing

Bug reports, fixes and templates are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, checks and release instructions.

## License

[Apache-2.0](LICENSE)
