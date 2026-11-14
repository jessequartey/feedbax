# Feedbax portal

Your self-hosted feedback portal, created by [create-feedbax](https://github.com/jessequartey/feedbax). Full docs: the [Feedbax README](https://github.com/jessequartey/feedbax#readme).

For help finishing setup, copy the [agent setup prompt](https://github.com/jessequartey/feedbax#set-up-with-an-agent) into your coding agent. It covers account access, deployment, verification and test-data cleanup.

## Develop

```sh
npm run dev      # http://localhost:3000
```

Secrets live in `.dev.vars` (git-ignored). Local data is separate from production. If `NOTION_TOKEN` is set, local posts also sync to your real Notion database, so delete the test rows afterwards.

## Deploy

```sh
npm run deploy   # build, apply migrations, deploy
```

## Configure

Edit `feedbax.config.ts`: `name`, `appUrl` (your app's URL, for **Back to app** and the dialog), `auth.anonymous` and `integrations.github`. Run `npm run deploy` after a change.

To rotate a production secret, run `npx wrangler secret put NOTION_TOKEN` (replace the name for other secrets).

## Theme

```sh
npx shadcn@latest apply --preset buFyyzw --only theme
```

Choose another preset at [shadcn Create](https://ui.shadcn.com/create) and replace `buFyyzw` with its code.

## Add the feedback dialog to your app

In your app, run:

```sh
npx shadcn@latest add https://raw.githubusercontent.com/jessequartey/feedbax/main/public/r/feedbax-feedback.json
```

Copy `FEEDBAX_HOST_SECRET` from `.dev.vars` to your app's server and add a token route. The steps are in the [main README](https://github.com/jessequartey/feedbax#add-the-feedback-dialog-to-your-app).

## Your Notion dashboard

Posts appear in the **Feedbax** database in Notion within about 5 minutes. Change **Status** there and the portal follows. Don't rename the database's columns. Check `/api/health` on your portal if sync stops.
