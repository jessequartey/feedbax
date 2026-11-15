import { randomBytes } from "node:crypto";
import {
  appUrlProblem,
  CliError,
  repoProblem,
  tokenProblem,
} from "../../create-feedbax/src/flags.ts";
import type { Flags } from "../../create-feedbax/src/flags.ts";
import { chooseRepo, githubGuide, validatedToken } from "../../create-feedbax/src/flow.ts";
import { README_URL } from "../../create-feedbax/src/links.ts";
import {
  loginCheckpoint,
  oauthFields,
  oauthSecrets,
  requireLogin,
} from "../../create-feedbax/src/login.ts";
import { writeVars } from "../../create-feedbax/src/project.ts";
import { loadClients } from "../../create-feedbax/src/providers.ts";
import type { GitHubSetupClient } from "../../../src/contracts/integrations.ts";
import type { SetupAnswers, Secrets } from "../../create-feedbax/src/types.ts";
import { emailFromProblem } from "../../../src/contracts/config.ts";
import { editConfig, setAppUrl, setEmailFrom, setGithubRepo } from "./config-edit.ts";
import {
  confirmStep,
  deployProject,
  loadProject,
  portalUrl,
  requireDeployedUrl,
  tools,
  type Context,
  type Project,
} from "./context.ts";

export const INTEGRATIONS = [
  "github",
  "github-login",
  "google-login",
  "host-login",
  "email",
  "webhooks",
] as const;
export type Integration = (typeof INTEGRATIONS)[number];
export type AddOptions = { repo?: string; appUrl?: string; from?: string };

type Change = {
  /** Production secrets (Cloudflare). */
  secrets: Record<string, string>;
  /** Values also kept in local .dev.vars (never production OAuth pairs). */
  local: Record<string, string>;
  config?: (text: string) => string;
  done: string;
};

export async function add(
  ctx: Context,
  integration: Integration,
  options: AddOptions,
): Promise<number> {
  const project = await loadProject(ctx);
  if (integration === "webhooks") {
    const portal = portalUrl(project) ?? "<your portal URL>";
    ctx.prompt.note(
      `Webhook endpoints are managed in your portal, not in files or secrets:\n1. npx feedbax admin  → open the printed sign-in link\n2. ${portal}/admin/settings → Webhooks → add an endpoint URL\n3. Copy its signing secret. Each request carries X-Feedbax-Signature: t=<unix seconds>,v1=<hex>, the HMAC-SHA256 of "<t>.<raw body>" keyed with that secret.\nEvents: post.created, post.status_changed, comment.created, vote.created, changelog.published.`,
      "Webhooks",
    );
    return 0;
  }
  if (!ctx.yes && !ctx.interactive)
    throw new CliError(
      "Use --yes with flags and environment variables in a non-interactive terminal.",
      2,
    );
  const change =
    integration === "github"
      ? await github(ctx, project, options)
      : integration === "host-login"
        ? await hostLogin(ctx, project, options)
        : integration === "email"
          ? await email(ctx, options)
          : await oauthLogin(ctx, project, integration === "github-login" ? "github" : "google");
  const { putSecrets } = tools(ctx, project);
  if (Object.keys(change.secrets).length)
    await ctx.prompt.step(`Set Cloudflare secrets: ${Object.keys(change.secrets).join(", ")}`, () =>
      putSecrets(change.secrets),
    );
  if (Object.keys(change.local).length)
    await writeVars(ctx.cwd, { ...project.vars, ...change.local });
  if (change.config) await editConfig(ctx.cwd, change.config);
  ctx.prompt.info(change.done);
  if (await confirmStep(ctx, "Redeploy now so the change takes effect?"))
    await deployProject(ctx, project);
  else ctx.prompt.info("Run npx feedbax deploy when you're ready.");
  return 0;
}

async function secretInput(
  ctx: Context,
  name: string,
  label: string,
  saved?: string,
): Promise<string> {
  const value = ctx.env[name] || saved;
  if (value) {
    const problem = tokenProblem(value);
    if (problem) throw new CliError(`${name}: ${problem}`, 2);
    return value;
  }
  if (ctx.yes) throw new CliError(`Set ${name} in the environment.`, 2);
  const typed = await ctx.prompt.text(label, { secret: true, validate: tokenProblem });
  ctx.hidden.push(typed);
  return typed;
}

async function textInput(
  ctx: Context,
  flag: string,
  given: string | undefined,
  label: string,
  problem: (value: string) => string | null | undefined,
): Promise<string> {
  if (given !== undefined) {
    const issue = problem(given);
    if (issue) throw new CliError(`${flag}: ${issue}`, 2);
    return given;
  }
  if (ctx.yes) throw new CliError(`Pass ${flag}.`, 2);
  return ctx.prompt.text(label, { validate: (value) => problem(value) ?? undefined });
}

async function github(ctx: Context, project: Project, options: AddOptions): Promise<Change> {
  if (options.repo !== undefined && repoProblem(options.repo))
    throw new CliError(repoProblem(options.repo)!, 2);
  if (!ctx.yes && !ctx.env.GITHUB_TOKEN) githubGuide(ctx.prompt);
  const factories = ctx.clients ?? (await loadClients());
  const auth = await validatedToken(
    "github",
    ctx.env.GITHUB_TOKEN || project.vars.GITHUB_TOKEN || undefined,
    {
      notion: (token) => factories.notion(token, ctx.fetch),
      github: (token) => factories.github(token, ctx.fetch),
    },
    ctx.prompt,
    ctx.yes,
  );
  ctx.hidden.push(auth.token);
  const flags: Flags = { yes: ctx.yes, help: false, version: false, githubRepo: options.repo };
  const repo = await chooseRepo(auth.client as GitHubSetupClient, flags, ctx.prompt);
  return {
    secrets: { GITHUB_TOKEN: auth.token },
    local: { GITHUB_TOKEN: auth.token },
    config: (text) => setGithubRepo(text, repo),
    done: `GitHub issue sync: ${repo}. In Notion, tick Send to GitHub on a post to open its issue.`,
  };
}

async function oauthLogin(
  ctx: Context,
  project: Project,
  provider: "github" | "google",
): Promise<Change> {
  const portal = requireDeployedUrl(project);
  // Only the environment counts: .dev.vars holds localhost (development) OAuth credentials.
  const secrets = { notionToken: "", ...oauthSecrets(ctx.env, {}) } as Secrets;
  const answers = { login: provider } as SetupAnswers;
  await loginCheckpoint(
    answers,
    secrets,
    portal,
    ctx.prompt,
    ctx.yes,
    (value) => ctx.hidden.push(value),
    async () => {},
  );
  requireLogin(answers, secrets);
  const [idName, secretName] = oauthFields[provider];
  const id = provider === "github" ? secrets.githubClientId! : secrets.googleClientId!;
  const secret = provider === "github" ? secrets.githubClientSecret! : secrets.googleClientSecret!;
  return {
    secrets: { [idName]: id, [secretName]: secret },
    local: {},
    done: `${provider === "github" ? "GitHub" : "Google"} sign-in configured for ${portal}. For localhost, use a separate development OAuth app in .dev.vars (callback http://localhost:3000/api/auth/callback/${provider}).`,
  };
}

function hostSecretProblem(value: string): boolean {
  return (
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    Buffer.from(value, "base64url").length < 32 ||
    Buffer.from(value, "base64url").toString("base64url") !== value
  );
}

async function hostLogin(ctx: Context, project: Project, options: AddOptions): Promise<Change> {
  requireDeployedUrl(project);
  const appUrl = await textInput(
    ctx,
    "--app-url",
    options.appUrl,
    "Your app's HTTPS URL",
    (value) => appUrlProblem(value),
  );
  requireLogin({ login: "host", appUrl }, {});
  const deployed = (await tools(ctx, project).secretNames()).includes("FEEDBAX_HOST_SECRET");
  let shared = project.vars.FEEDBAX_HOST_SECRET;
  if (shared && hostSecretProblem(shared))
    throw new CliError(
      "FEEDBAX_HOST_SECRET in .dev.vars must be canonical base64url of at least 32 bytes. Restore the original value.",
      2,
    );
  if (!shared && deployed)
    throw new CliError(
      "FEEDBAX_HOST_SECRET is set in Cloudflare but missing from .dev.vars, and Cloudflare cannot show it. Restore it into .dev.vars from your backup, then retry.",
      2,
    );
  const secrets: Record<string, string> = {};
  if (!shared) {
    shared = randomBytes(32).toString("base64url");
    ctx.hidden.push(shared);
  }
  if (!deployed) secrets.FEEDBAX_HOST_SECRET = shared;
  return {
    secrets,
    local: { FEEDBAX_HOST_SECRET: shared },
    config: (text) => setAppUrl(text, appUrl),
    done: `Host login: appUrl = ${appUrl}. Next, in your app: copy FEEDBAX_HOST_SECRET from .dev.vars to its server environment (keep it unchanged and server-side), then add the token endpoint and FeedbaxLink: ${README_URL}`,
  };
}

async function email(ctx: Context, options: AddOptions): Promise<Change> {
  const key = await secretInput(ctx, "RESEND_API_KEY", "Resend API key (re_…)");
  const from = await textInput(
    ctx,
    "--from",
    options.from,
    "Send email from (Name <feedback@your-domain.com>)",
    emailFromProblem,
  );
  return {
    secrets: { RESEND_API_KEY: key },
    local: { RESEND_API_KEY: key },
    config: (text) => setEmailFrom(text, from),
    done: `Email notifications from ${from}. Verify that sending domain at https://resend.com/domains. Remove notifications.email from feedbax.config.ts to turn email off.`,
  };
}
