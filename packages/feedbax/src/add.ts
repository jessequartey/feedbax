import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
import type { FeedbaxConfig } from "../../../src/contracts/config.ts";
import { AI_CLI_PROVIDERS, validateAiKey, type AiCliProvider } from "./ai.ts";
import { validateResendKey } from "./resend.ts";
import {
  loadConfig,
  prepareConfigEdit,
  setAppUrl,
  setEmailFrom,
  setGithubRepo,
} from "./config-edit.ts";
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
  "ai",
] as const;
export type Integration = (typeof INTEGRATIONS)[number];
export type AddOptions = { repo?: string; appUrl?: string; from?: string; provider?: string };

type Change = {
  /** Production secrets (Cloudflare). */
  secrets: Record<string, string>;
  /** Values also kept in local .dev.vars (never production OAuth pairs). */
  local: Record<string, string>;
  config?: (text: string) => string;
  checkConfig?: (config: FeedbaxConfig) => boolean;
  done: string;
  retryOptions?: AddOptions;
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
  await loadConfig(ctx.cwd);
  const change =
    integration === "github"
      ? await github(ctx, project, options)
      : integration === "host-login"
        ? await hostLogin(ctx, project, options)
        : integration === "email"
          ? await email(ctx, project, options)
          : integration === "ai"
            ? await ai(ctx, project, options)
            : await oauthLogin(ctx, project, integration === "github-login" ? "github" : "google");
  const config = change.config ? await prepareConfigEdit(ctx.cwd, change.config) : undefined;
  if (config && change.checkConfig && !change.checkConfig(config.config))
    throw new CliError(
      "Could not apply the requested setting unambiguously. Edit feedbax.config.ts by hand, then retry. Nothing changed.",
      2,
    );
  // writeVars can also update .gitignore. Compare files on failure so even a partial
  // local write is included in the recovery report, without ever printing its contents.
  const files = ["feedbax.config.ts", ".dev.vars", ".gitignore"];
  const before = await Promise.all(files.map((path) => readOptional(ctx.cwd, path)));
  let secretAttempted = false;
  let secretsSet = false;
  const names = Object.keys(change.secrets);
  const retry = [
    "npx feedbax add",
    integration,
    ...Object.entries(change.retryOptions ?? options).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [`--${key === "appUrl" ? "app-url" : key}`, `'${value.replaceAll("'", "'\\''")}'`],
    ),
    ...(ctx.yes ? ["--yes"] : []),
  ].join(" ");
  try {
    if (config?.changed) {
      await config.write();
    }
    if (Object.entries(change.local).some(([key, value]) => project.vars[key] !== value)) {
      await writeVars(ctx.cwd, { ...project.vars, ...change.local });
    }
    if (names.length) {
      secretAttempted = true;
      await ctx.prompt.step(`Set Cloudflare secrets: ${names.join(", ")}`, () =>
        tools(ctx, project).putSecrets(change.secrets),
      );
      secretsSet = true;
    }
    ctx.prompt.info(change.done);
    if (await confirmStep(ctx, "Redeploy now so the change takes effect?"))
      await deployProject(ctx, project);
    else ctx.prompt.info("Run npx feedbax deploy when you're ready.");
  } catch (error) {
    const after = await Promise.all(files.map((path) => readOptional(ctx.cwd, path)));
    const changed = files.filter((_path, index) => before[index] !== after[index]);
    if (secretsSet) changed.push(`Cloudflare secrets: ${names.join(", ")}`);
    if (changed.length || secretAttempted) {
      ctx.prompt.error(
        `Changed: ${changed.join("; ") || "no confirmed changes"}.${
          secretAttempted && !secretsSet
            ? ` Cloudflare secret update was attempted for ${names.join(", ")}; its outcome is unknown.`
            : ""
        }\nRecovery: ${secretsSet ? "npx feedbax deploy" : retry}`,
      );
    }
    throw error;
  }
  return 0;
}

async function readOptional(cwd: string, path: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
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
  const problem = tokenProblem(typed);
  if (problem) throw new CliError(`${name}: ${problem}`, 2);
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
  const typed = await ctx.prompt.text(label, { validate: (value) => problem(value) ?? undefined });
  const issue = problem(typed);
  if (issue) throw new CliError(`${flag}: ${issue}`, 2);
  return typed;
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
      github: (token) => {
        if (!/^(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+|[a-f0-9]{40})$/.test(token))
          throw new CliError(
            "GITHUB_TOKEN must be a GitHub access token (github_pat_… or ghp_…).",
            2,
          );
        return factories.github(token, ctx.fetch);
      },
    },
    ctx.prompt,
    ctx.yes,
  );
  ctx.hidden.push(auth.token);
  const flags: Flags = { yes: ctx.yes, help: false, version: false, githubRepo: options.repo };
  const repo = await chooseRepo(auth.client as GitHubSetupClient, flags, ctx.prompt);
  return {
    retryOptions: { repo },
    secrets: { GITHUB_TOKEN: auth.token },
    local: { GITHUB_TOKEN: auth.token },
    config: (text) => setGithubRepo(text, repo),
    checkConfig: (config) =>
      Boolean(config.integrations.github && config.integrations.github.repo === repo),
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
  const validId =
    provider === "google"
      ? /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)
      : /^(?:[a-f0-9]{20}|Ov23[A-Za-z0-9]{16})$/i.test(id);
  if (!validId)
    throw new CliError(
      `${idName} is not a ${provider} OAuth client ID. Copy it from your OAuth app settings.`,
      2,
    );
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
  const supplied = ctx.env.FEEDBAX_HOST_SECRET;
  if (supplied && project.vars.FEEDBAX_HOST_SECRET && supplied !== project.vars.FEEDBAX_HOST_SECRET)
    throw new CliError(
      "FEEDBAX_HOST_SECRET differs from .dev.vars. Restore the original shared secret instead of rotating it.",
      2,
    );
  let shared = supplied || project.vars.FEEDBAX_HOST_SECRET;
  if (shared && hostSecretProblem(shared))
    throw new CliError(
      "FEEDBAX_HOST_SECRET must be canonical base64url of at least 32 bytes. Restore the original value.",
      2,
    );
  const deployed = (await tools(ctx, project).secretNames()).includes("FEEDBAX_HOST_SECRET");
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
    retryOptions: { appUrl },
    config: (text) => setAppUrl(text, appUrl),
    checkConfig: (config) => config.appUrl === appUrl,
    done: `Host login: appUrl = ${appUrl}. Next, in your app: copy FEEDBAX_HOST_SECRET from .dev.vars to its server environment (keep it unchanged and server-side), then add the token endpoint and FeedbaxLink: ${README_URL}`,
  };
}

async function ai(ctx: Context, project: Project, options: AddOptions): Promise<Change> {
  let provider: AiCliProvider;
  if (options.provider !== undefined) {
    if (!(AI_CLI_PROVIDERS as readonly string[]).includes(options.provider))
      throw new CliError("--provider must be jev, gemini or openai.", 2);
    provider = options.provider as AiCliProvider;
  } else if (ctx.yes) {
    throw new CliError("Pass --provider jev, gemini or openai.", 2);
  } else {
    provider = (await ctx.prompt.select("Which AI provider?", [
      { value: "gemini", label: "Google Gemini" },
      { value: "openai", label: "OpenAI" },
      { value: "jev", label: "Jev (TypeSafe AI)" },
    ])) as AiCliProvider;
  }
  const key = await secretInput(ctx, "AI_API_KEY", "AI API key", project.vars.AI_API_KEY);
  await validateAiKey(provider, key, ctx.fetch);
  return {
    retryOptions: { provider },
    secrets: { AI_API_KEY: key },
    local: { AI_API_KEY: key },
    done: `AI provider key saved for ${provider}. Choose ${provider} in /admin/settings → AI suggestions. Local suggestions need no key.`,
  };
}

async function email(ctx: Context, project: Project, options: AddOptions): Promise<Change> {
  const key = await secretInput(
    ctx,
    "RESEND_API_KEY",
    "Resend API key (re_…)",
    project.vars.RESEND_API_KEY,
  );
  const from = await textInput(
    ctx,
    "--from",
    options.from,
    "Send email from (Name <feedback@your-domain.com>)",
    emailFromProblem,
  );
  await validateResendKey(key, ctx.fetch);
  return {
    retryOptions: { from },
    secrets: { RESEND_API_KEY: key },
    local: { RESEND_API_KEY: key },
    config: (text) => setEmailFrom(text, from),
    checkConfig: (config) =>
      Boolean(config.notifications.email && config.notifications.email.from === from),
    done: `Email notifications from ${from}. Verify that sending domain at https://resend.com/domains. Remove notifications.email from feedbax.config.ts to turn email off.`,
  };
}
