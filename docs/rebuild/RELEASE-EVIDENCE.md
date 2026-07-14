# v0.1.0 public-preview release evidence

Recorded on 2026-07-14 for PR #7.

## Founder launch

- Merged PR 7 after all required checks and CodeRabbit completed successfully.
- Generated an email-only Cloudflare project from public npm packages in a clean temporary directory and passed installation/type-checking.
- Provisioned fresh private official and sanitized starter Notion database sets; both passed `feedbax doctor`.
- Deployed and smoked the docs Worker at `https://feedbax-docs.jessefquartey.workers.dev`.
- Deployed and smoked the email-only dogfood portal at `https://feedbax-feedback.jessefquartey.workers.dev`; the live email route returns a secure HTTP-only session cookie.
- Published the duplicable starter at `https://brave-number-c98.notion.site/Feedbax-Notion-Starter-39dafe1596918155a94cc24a1a41a2a5` with credentials and production identifiers excluded.

## npm publication

The public registry resolves all five packages, and npm reports `jessequartey` as
a maintainer:

- [`create-feedbax@0.1.0`](https://www.npmjs.com/package/create-feedbax/v/0.1.0)
- [`feedbax@0.1.1`](https://www.npmjs.com/package/feedbax/v/0.1.1) (`0.1.0` was
  published first; `0.1.1` contains the quickstart doctor fix)
- [`@feedbax/core@0.1.0`](https://www.npmjs.com/package/@feedbax/core/v/0.1.0)
- [`@feedbax/notion@0.1.0`](https://www.npmjs.com/package/@feedbax/notion/v/0.1.0)
- [`@feedbax/auth-handoff@0.1.0`](https://www.npmjs.com/package/@feedbax/auth-handoff/v/0.1.0)

A clean temporary project installed the exact registry versions without
workspace or tarball references. Registry metadata, public access, package
contents, tarball URLs, and ownership were checked after publication.

## Credentialed Notion workflow

[GitHub Actions run 29368767723](https://github.com/jessequartey/feedbax/actions/runs/29368767723)
passed every job. `Integration / Notion smoke` prepared the live fixture, ran
doctor, then browsed, submitted, voted, removed the vote, and commented through
the portal. The fixture cleanup ran without placing credentials or data-source
identifiers in committed evidence.

## Independent quickstart

Codex controlled the keyboard in a fresh temporary directory and cache. The
documented default command completed generation, dependency installation, and
type-checking in **26 seconds**. The generated project then passed its build and
`feedbax doctor` checks.

Recorded friction:

- npm reported a package download below 50 KiB/s;
- pnpm reported that the `esbuild@0.28.1` build script was ignored;
- the first doctor run exposed JSONC trailing-comma handling in `feedbax@0.1.0`;
  the parser was fixed, tested, released as `feedbax@0.1.1`, and the clean doctor
  run then passed.
