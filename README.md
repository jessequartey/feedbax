# Feedbax

A self-hosted feedback portal for your product. People post ideas, vote and comment. Your team triages in Notion and, if you want, approves posts into GitHub issues.

![Feedbax portal](docs/screenshot.png)

[![npm version](https://img.shields.io/npm/v/create-feedbax.svg)](https://www.npmjs.com/package/create-feedbax)
[![license](https://img.shields.io/npm/l/create-feedbax.svg)](LICENSE)

Two templates, one app:

- **Notion**: posts show up in a Notion database. You change Status there.
- **Notion + GitHub**: the same, plus a **Send to GitHub** tickbox that creates one issue per post.

You need:

- **Node 24** or newer (24.x).
- A **Notion workspace** where you are an owner.
- A **Cloudflare account** (free). The CLI walks you through enabling R2 and picking a workers.dev subdomain.
- Optional: a GitHub account and a repository, for the GitHub template.

## Get started

**1. Duplicate the Notion template.**
Open [the Feedbax template](https://www.notion.so/NOTION_TEMPLATE_URL_PLACEHOLDER) and click **Duplicate** (top right). This step is optional: without it, Feedbax creates the database for you on a page you choose.

**2. Create a Notion integration.**

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations).
2. Click **New integration**, choose your workspace, set the type to **Internal** and save.
3. Copy the **Internal Integration Secret**. It starts with `ntn_`.
4. Open the integration's **Content access** tab, choose **Edit access** and select the duplicated Feedbax page (or the page where Feedbax should create its database).
5. If the page isn't listed, open it in Notion and click `•••` → **Connections** → add your integration.

Creating an integration needs a workspace owner.

**3. (GitHub template only) Create a GitHub token.**
Open [this prefilled link](https://github.com/settings/personal-access-tokens/new?name=Feedbax&description=Feedbax+issue+sync&issues=write). Under **Repository access** choose **Only select repositories** and pick your repo. Under **Permissions** make sure **Issues** is **Read and write**. Generate the token and copy it.

**4. Run the CLI.**

```sh
npx create-feedbax@latest
```

```sh
pnpm dlx create-feedbax@latest
```

```sh
bunx create-feedbax@latest
```

The CLI asks every question first:

1. Project name.
2. Template: Notion, or Notion + GitHub.
3. Your Notion secret (masked). Feedbax finds the database on its own; if it finds none, it lists your shared pages so you can pick where to create one.
4. GitHub token and repository (GitHub template only).
5. Whether people can post without an account.
6. Cloudflare login. A browser window opens.

Then it creates the database, storage bucket and queue, runs the migrations and deploys. Nothing else to answer.

If R2 isn't enabled on your Cloudflare account, the CLI shows a link. Open it, click **Enable R2** (the free tier needs a payment method on file) and press Enter. If you have no workers.dev subdomain yet, the CLI asks you to pick one.

**5. You're live.**

```text
✔ Your feedback portal is live: https://my-feedback.<subdomain>.workers.dev
  Notion database: <url>
```

Submit a post. It appears in Notion within about 5 minutes.

If setup stops for any reason, fix the problem and run the same command again. It asks `Finish setting up my-feedback?` and continues from where it stopped. It never deletes anything.

## How it works

```text
   people ──> your portal (one Cloudflare Worker)
                  │
                  ▼
      D1 database  = source of truth (users, posts, comments, votes)
      R2 bucket    = image files
                  │
        every 5 minutes (and right after a post)
                  │
                  ▼
      Notion       = your team's dashboard
                  │  you tick "Send to GitHub"
                  ▼
      GitHub issue = created once, per approved post
                  │  issue closed
                  ▼
      post becomes Done on the portal
```

- The portal keeps working if Notion or GitHub is down. Sync catches up later.
- Posts and images are public as soon as they are submitted.
- Everything runs on Cloudflare's free plan (see [the free plan note](#free-plan-note)).

### Team workflow

- Change **Status** in Notion (Open, Planned, In progress, Done, Closed). The portal updates in about 5 minutes. **Closed** means declined, a duplicate or out of scope. **Done** means delivered.
- Tick **Send to GitHub** (GitHub template) to create one issue. Unticking later does nothing.
- Closing the linked issue sets the post to **Done**. That is final: reopening the issue does not undo it.
- Don't rename the database's columns. You can add your own columns and views.
- Votes, comments, author and links are written by Feedbax. Status and Send to GitHub are yours.

## Add the feedback dialog to your app

Embed a "Send feedback" dialog, with screenshot and annotation, in your own product. Signed-in users in your app post as themselves, with no second login.

**1. Install the block** (needs shadcn 4.7 or newer):

```sh
npx shadcn@latest add https://raw.githubusercontent.com/jessequartey/feedbax/v0.3.0/public/r/feedbax-feedback.json
```

This copies the components into `components/feedbax/` and helpers into `lib/feedbax/`. It follows your theme.

**2. Add a token endpoint on your server.**
Copy `FEEDBAX_HOST_SECRET` from your portal's `.dev.vars` into your app's server environment. Then add one authenticated route, `POST /api/feedbax-token`. It must read the user from your own session, never from the request body, and reject anonymous or cross-origin requests.

A plain Web handler:

```ts
import { mintFeedbaxToken } from "@/lib/feedbax/token.server";

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request); // your own auth
  if (!user) return new Response("Unauthorized", { status: 401 });
  const token = await mintFeedbaxToken({
    secret: process.env.FEEDBAX_HOST_SECRET!,
    user: { id: user.id, name: user.name },
  });
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
```

Mounted in TanStack Start (`src/routes/api/feedbax-token.ts`):

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/feedbax-token")({
  server: {
    handlers: {
      POST: ({ request }) => POST(request), // the handler above
    },
  },
});
```

Not using JavaScript? Any library that signs an HS256 JWT works. Header exactly `{"alg":"HS256","typ":"JWT"}`. Key: the base64url-decoded `FEEDBAX_HOST_SECRET`. Claims: `sub` (your stable user ID, 1–200 chars), `name` (1–80 chars), `exp` (at most 5 minutes ahead) and `jti` (a fresh UUID). Every token works once.

**3. Render the dialog and the link.**

```tsx
import { FeedbaxDialog } from "@/components/feedbax/feedback-dialog";
import { FeedbaxLink } from "@/components/feedbax/feedbax-link";

<FeedbaxDialog portalUrl="https://my-feedback.<subdomain>.workers.dev" />

<FeedbaxLink portalUrl="https://my-feedback.<subdomain>.workers.dev">
  Go to feedbax
</FeedbaxLink>
```

`<FeedbaxLink>` signs the user in on the portal and opens the board. Then set `appUrl` in the portal's `feedbax.config.ts` to your app's URL and run `npm run deploy`. That also enables the **Back to app** link and allows your app's origin to post.

`FeedbaxDialog` props:

| Prop               | Default              | What it does                                                                                     |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------ |
| `portalUrl`        | required             | Your portal's URL                                                                                |
| `tokenUrl`         | `/api/feedbax-token` | Your token endpoint                                                                              |
| `getToken`         | none                 | Overrides `tokenUrl` with your own function                                                      |
| `trigger`          | a "Feedback" button  | Your own trigger element                                                                         |
| `redirectOnSubmit` | `true`               | After submitting, sign in and open the new post. When `false`, shows a **View your post** button |
| `onSubmitted`      | none                 | Called with the result                                                                           |

`FeedbaxLink` props: `portalUrl`, `tokenUrl`, `getToken`, `to` (`/` or `/posts/<id>`), `target` (`_self` or `_blank`) and `children`.

**Screenshots.** The Screenshot button takes a snapshot of the page's DOM. Cross-origin images without CORS headers, iframes, video frames and some CSS effects may come out blank or different. Add `data-feedbax-ignore` to any element you want left out. The menu also offers **Capture screen instead…** where the browser supports it. Upload, paste (⌘/Ctrl+V) and drag-and-drop always work. The dialog never captures by itself and never attaches your page URL.

Host users always need to be signed in to your app, even if the portal allows anonymous posts. Host identities and standalone portal accounts are separate in 0.3.

## Configuration

Edit `feedbax.config.ts` in your project:

```ts
export default defineConfig({
  name: "Feedbax", // shown in the header, 1–60 chars
  appUrl: undefined, // your app's URL
  auth: { anonymous: false },
  integrations: {
    notion: { dataSourceId: "…" }, // filled in by the CLI
    github: false, // or { repo: "owner/repo" }
  },
});
```

| Option                             | What it does                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                             | The portal name.                                                                                                                                          |
| `appUrl`                           | Absolute HTTPS URL of your app (`http` is fine for localhost). Shows **Back to app** and is the only origin allowed to post from the block. No wildcards. |
| `auth.anonymous`                   | `true`: people can post, comment and vote without an account. Their posts follow them if they sign up later.                                              |
| `integrations.github`              | `false`, or `{ repo: "owner/repo" }`. Needs the `GITHUB_TOKEN` secret.                                                                                    |
| `integrations.notion.dataSourceId` | Set by the CLI. Don't change it by hand.                                                                                                                  |

Run `npm run deploy` after any change.

### Secrets and variables

| Name                                       | Kind     | Where it comes from                                                                                                   |
| ------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `PORTAL_URL`                               | variable | The CLI writes it to `wrangler.jsonc` (and `.dev.vars` for local).                                                    |
| `BETTER_AUTH_SECRET`                       | secret   | Generated by the CLI.                                                                                                 |
| `FEEDBAX_HOST_SECRET`                      | secret   | Generated by the CLI. Copy it to your app's server when you embed the dialog.                                         |
| `NOTION_TOKEN`                             | secret   | The Notion secret you pasted.                                                                                         |
| `GITHUB_TOKEN`                             | secret   | GitHub template only. A fine-grained token for one repository with Issues read/write. It is only used to sync issues. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | optional | Only for "Sign in with GitHub". Separate from `GITHUB_TOKEN`.                                                         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Only for "Sign in with Google".                                                                                       |

Locally, secrets live in `.dev.vars` (git-ignored). In production they are Cloudflare secrets. Never put secrets in `VITE_*` variables or in the config file.

Social login appears when both values of a pair are set; setting only one stops the portal at startup. The callback URLs are `${PORTAL_URL}/api/auth/callback/github` and `${PORTAL_URL}/api/auth/callback/google`.

To set or rotate a production secret:

```sh
npx wrangler secret put NOTION_TOKEN
```

Good to know:

- There is no email service. No verification mail and no password reset. Passwords are 12–128 characters.
- The `GITHUB_TOKEN` (issue sync) and the GitHub OAuth keys (login) are different things. You can use either, both or neither.

## Theming

The portal uses shadcn/ui. Change the look with the shadcn CLI:

```sh
npx shadcn@latest apply --preset <code> --only theme   # colors only
npx shadcn@latest apply --preset <code>                # full style
```

Pick a preset at [ui.shadcn.com/create](https://ui.shadcn.com/create) and copy its code. The default is `buFyyzw`. The dialog in your app follows your own theme.

## Deploy and update

```sh
npm run dev      # local portal on http://localhost:3000
npm run deploy   # build, apply migrations, deploy
```

- **Local data is separate.** `npm run dev` uses a local database. If `NOTION_TOKEN` is set, local posts also sync to your real Notion database. Delete the test rows afterwards. To trigger a sync locally: `curl "http://localhost:3000/cdn-cgi/handler/scheduled"`.
- **Custom domain.** Change the route in `wrangler.jsonc` and `PORTAL_URL` together, then deploy.
- **Updating.** Updates are source-level in 0.3. Run `npx create-feedbax@latest` into a new folder and copy your `feedbax.config.ts` and `wrangler.jsonc` across, or copy changed files by hand.
- **Removing spam.** There is no moderation screen. Use SQL:

  ```sh
  npx wrangler d1 execute DB --remote --command "DELETE FROM posts WHERE id = '<post id>'"
  ```

## Troubleshooting

**First, check health and logs.** Open `https://<your portal>/api/health`. It reports `ok`, `notion` and `github` (`ok`, `failing` or `off`). For details run `npx wrangler tail` or open Workers Logs in the Cloudflare dashboard. Logs never contain tokens or post text.

| Problem                                               | Fix                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI: "check you copied the whole secret" (Notion 401) | Copy the full **Internal Integration Secret** (starts with `ntn_`) from [notion.so/profile/integrations](https://www.notion.so/profile/integrations).                                                                                                                        |
| CLI: finds no database                                | In the integration's **Content access** tab choose **Edit access** and add the Feedbax page. Or open the page → `•••` → **Connections** → add the integration. Then choose "I just shared one — search again" or paste the page link. Notion's search can lag a few seconds. |
| CLI: "R2 isn't enabled on this account"               | Open the link, click **Enable R2** (the free tier needs a payment method on file), then press Enter.                                                                                                                                                                         |
| CLI: workers.dev subdomain                            | Pick one when asked. If the CLI can't register it, open Workers & Pages in the Cloudflare dashboard, set your subdomain and press Enter.                                                                                                                                     |
| CLI: resource name already exists                     | Another project in your account uses `<name>-db`, `<name>-images` or `<name>-sync`. Choose a different project name.                                                                                                                                                         |
| CLI stopped halfway                                   | Run the same command again and answer yes to `Finish setting up …?`. Your secrets and resources are reused.                                                                                                                                                                  |
| GitHub: repo rejected                                 | The repo must be `owner/repo`, not archived, with Issues turned on. The token must be limited to that repo with Issues read and write.                                                                                                                                       |
| Posts don't reach Notion                              | `/api/health` shows `notion: failing`. Check the integration still has access to the page and that nobody renamed or changed the type of a required column. Fix it; the next sync clears the error.                                                                          |
| Status changes in Notion don't show                   | Wait up to 5 minutes. Make sure Status is one of Open, Planned, In progress, Done or Closed.                                                                                                                                                                                 |
| No GitHub issue appeared                              | Tick **Send to GitHub** and wait up to 5 minutes. Check `/api/health` for `github: failing`.                                                                                                                                                                                 |
| Block says the link expired / 401                     | Tokens last 5 minutes and work once. Reload and try again. Check that `FEEDBAX_HOST_SECRET` matches the portal's and that your server clock is correct.                                                                                                                      |
| Block blocked by CORS                                 | Set `appUrl` in `feedbax.config.ts` to your app's exact origin and run `npm run deploy`.                                                                                                                                                                                     |
| Can't reset a password                                | There is no reset flow in 0.3. Use social login, host login, or delete the user with `wrangler d1 execute`.                                                                                                                                                                  |

## Free plan note

Feedbax runs on Cloudflare's free tier: one Worker, one D1 database, one R2 bucket, one Queue and one of your account's 5 free Cron triggers. Idle, it uses about 1.7k Queue operations a day against 10k free. Check [Cloudflare's current limits](https://developers.cloudflare.com/workers/platform/pricing/) for your own traffic.

Workers Free allows 10 ms of CPU per request. Hashing passwords is the heavy part, so Feedbax uses PBKDF2 (Web Crypto) with 100,000 iterations. That fits the free limit but is weaker than the 600,000 OWASP suggests for PBKDF2. To compensate, passwords need 12+ characters, sign-in attempts are rate-limited and the database is private.

Measured CPU time on a Workers Free account: _to be filled in from the release measurement_.

Consider [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) ($5/month) if email/password sign-ups time out, or if you want a higher margin on page rendering. Social login and host login don't hash passwords.

## Contributing

```sh
git clone https://github.com/jessequartey/feedbax.git
cd feedbax
npm ci
cp .dev.vars.example .dev.vars   # fill in values
npm run dev
```

The repo uses [Vite+](https://viteplus.dev) (`vp`). Before sending a PR:

```sh
npm run check       # format, lint
npm run typecheck
npm test
npm run build
```

Other scripts: `registry:build` (regenerates `public/r/feedbax-feedback.json`; commit the result), `cli:build`, `test:package`. See [CONTRIBUTING.md](CONTRIBUTING.md).

### Releasing

Maintainers only. Only `create-feedbax` is published.

1. One-time: publish the Notion template (Share → Publish, turn on **Allow duplicate as template**) and set `NOTION_TEMPLATE_URL` in the CLI and in this README. The release fails while it is still a placeholder.
2. One-time: on npmjs.com open `create-feedbax` → **Settings** → **Trusted Publisher** → GitHub Actions. Enter owner `jessequartey`, repository `feedbax`, workflow `release.yml`.
3. Set the version in `packages/create-feedbax/package.json` and update `CHANGELOG.md`.
4. Tag and push: `git tag v0.3.0 && git push origin v0.3.0`.

The workflow checks the tag against the package version, builds, publishes with provenance and creates the GitHub Release.

## License

[Apache-2.0](LICENSE)
