#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appUrlProblem,
  Cancelled,
  CliError,
  detectPackageManager,
  HELP,
  parseFlags,
  projectProblem,
} from "./flags.ts";
import { chooseNotion, chooseRepo, githubGuide, notionGuide, validatedToken } from "./flow.ts";
import { createPrompter, createRunner, redact } from "./io.ts";
import { NOTION_INTEGRATION_URL, NOTION_TEMPLATE_URL, README_URL, VERSION } from "./links.ts";
import {
  ensureSecrets,
  exists,
  readVars,
  savedAnswers,
  scaffold,
  writeAppConfig,
} from "./project.ts";
import { loadClients } from "./providers.ts";
import { inferredLogin, oauthFields, oauthSecrets, requireLogin } from "./login.ts";
import { setup } from "./setup.ts";
import type { NotionSetupClient, GitHubSetupClient } from "../../../src/contracts/integrations.ts";
import type { Clients, Prompter, Run, Secrets, SetupAnswers } from "./types.ts";
export { setup } from "./setup.ts";
export type CliDeps = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  prompt?: Prompter;
  run?: Run;
  fetch?: typeof fetch;
  clients?: Clients;
  templateDir?: string;
};
export async function main(argv = process.argv.slice(2), overrides: CliDeps = {}): Promise<number> {
  const env = overrides.env ?? process.env;
  const hidden: string[] = Object.entries(env)
    .filter(([key]) => /TOKEN|SECRET|PASSWORD|API_KEY|CLIENT_ID/.test(key))
    .map(([, value]) => value!)
    .filter(Boolean);
  let prompt = overrides.prompt ?? createPrompter(argv.includes("--yes"));
  const controller = new AbortController();
  const signal = () => controller.abort();
  process.on("SIGINT", signal);
  const run = overrides.run ?? createRunner(controller.signal);
  const fetchFn: typeof fetch =
    overrides.fetch ??
    ((input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([controller.signal, init?.signal ?? AbortSignal.timeout(10_000)]),
      }));
  let cwd = "",
    created = false,
    remote = false,
    install: Promise<{ error?: unknown }> | undefined;
  let retry = "npx create-feedbax";
  try {
    const flags = parseFlags(argv);
    if (flags.help) {
      console.log(HELP);
      return 0;
    }
    if (flags.version) {
      console.log(VERSION);
      return 0;
    }
    prompt = overrides.prompt ?? createPrompter(flags.yes);
    if (flags.yes && !flags.name)
      throw new CliError("Non-interactive setup needs a project name.", 2);
    if (!flags.yes && !process.stdin.isTTY && !overrides.prompt)
      throw new CliError("Use --yes with explicit flags in a non-interactive terminal.", 2);
    prompt.intro(`Feedbax ${VERSION}  ·  Feedback, connected.`);
    const name =
      flags.name ??
      (await prompt.text("Project name", {
        defaultValue: "my-feedback",
        validate: projectProblem,
      }));
    cwd = resolve(overrides.cwd ?? process.cwd(), name);
    retry = `npx create-feedbax ${name}${
      flags.yes
        ? argv
            .filter((arg) => arg !== flags.name)
            .map((arg) => ` '${arg.replaceAll("'", "'\\''")}'`)
            .join("")
        : ""
    }`;
    const saved = await savedAnswers(cwd);
    if (
      saved.notionDataSourceId &&
      ((flags.anonymous !== undefined && flags.anonymous !== saved.anonymous) ||
        (flags.private !== undefined && flags.private !== Boolean(saved.private)) ||
        (flags.template !== undefined && flags.template !== saved.template) ||
        (flags.githubRepo !== undefined && flags.githubRepo !== saved.githubRepo))
    )
      throw new CliError(
        "These flags conflict with an already configured project. Edit feedbax.config.ts explicitly before rerunning setup.",
        2,
      );
    if (saved.notionDataSourceId && flags.notionPage) {
      const resumeArgs: string[] = [];
      for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!;
        if (arg === "--notion-page") {
          index++;
          continue;
        }
        if (!arg.startsWith("--notion-page=")) resumeArgs.push(arg);
      }
      if (!flags.name) resumeArgs.unshift(name);
      retry = `npx create-feedbax${resumeArgs.map((arg) => ` '${arg.replaceAll("'", "'\\''")}'`).join("")}`;
    }
    const prior = await readVars(cwd);
    hidden.push(...Object.values(prior));
    if (
      prior.FEEDBAX_HOST_SECRET !== undefined &&
      (!/^[A-Za-z0-9_-]+$/.test(prior.FEEDBAX_HOST_SECRET) ||
        Buffer.from(prior.FEEDBAX_HOST_SECRET, "base64url").length < 32 ||
        Buffer.from(prior.FEEDBAX_HOST_SECRET, "base64url").toString("base64url") !==
          prior.FEEDBAX_HOST_SECRET)
    )
      throw new CliError(
        "FEEDBAX_HOST_SECRET must be canonical base64url encoding of at least 32 bytes. Restore the existing shared key before resuming; setup will not rotate it.",
        2,
      );
    const oauth = oauthSecrets(env, prior);
    const resume = await exists(join(cwd, "feedbax.config.ts"));
    const savedOAuthProviders = resume
      ? (["github", "google"] as const).filter((provider) => {
          const [id, secret] = oauthFields[provider];
          return Boolean(prior[id] && prior[secret] && !(env[id] && env[secret]));
        })
      : [];
    const inferred = inferredLogin(oauth, saved.appUrl);
    // No sign-in provider by default: anonymous feedback works out of the box.
    // Add one later with `npx feedbax add github-login | google-login | host-login`.
    let login = flags.login ?? inferred;
    let appUrl = flags.appUrl ?? saved.appUrl;
    if (
      flags.appUrl !== undefined &&
      ((saved.appUrl && flags.appUrl !== saved.appUrl) ||
        (saved.notionDataSourceId && !saved.appUrl))
    )
      throw new CliError(
        "--app-url conflicts with this configured project. Edit appUrl in feedbax.config.ts explicitly before rerunning setup.",
        2,
      );
    if (flags.yes) {
      if (savedOAuthProviders.length)
        throw new CliError(
          `Resume needs explicit production OAuth credentials: ${savedOAuthProviders.flatMap((provider) => oauthFields[provider]).join(", ")}. Local .dev.vars may contain localhost credentials. Set production values in the environment, or rerun interactively to confirm them.`,
          2,
        );
      requireLogin({ login, appUrl }, oauth);
      const required = [
        !(env.NOTION_TOKEN || prior.NOTION_TOKEN) && "NOTION_TOKEN",
        !env.CLOUDFLARE_API_TOKEN && "CLOUDFLARE_API_TOKEN",
        !env.CLOUDFLARE_ACCOUNT_ID && "CLOUDFLARE_ACCOUNT_ID",
        (flags.template ?? saved.template) === "notion-github" &&
          !(env.GITHUB_TOKEN || prior.GITHUB_TOKEN) &&
          "GITHUB_TOKEN",
        (flags.template ?? saved.template) === "notion-github" &&
          !(flags.githubRepo ?? saved.githubRepo) &&
          "--github-repo",
      ].filter(Boolean);
      if (required.length)
        throw new CliError(`Non-interactive setup needs ${required.join(", ")}.`, 2);
    }
    if (resume && !flags.yes && !(await prompt.confirm(`Finish setting up ${name}?`, true)))
      throw new Cancelled();
    const pm = flags.packageManager ?? detectPackageManager(env.npm_config_user_agent);
    const begin = async () => {
      const result = await prompt.step("Scaffold portal", () =>
        scaffold(
          cwd,
          overrides.templateDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "../template"),
          name,
        ),
      );
      created = result.created;
      hidden.push(...Object.values(await ensureSecrets(cwd, {})));
      install = run(pm, ["install"], { cwd, env: { CI: "true" } }).then(
        (r) =>
          r.code
            ? {
                error: new CliError(
                  redact(`Dependency install failed.\n${r.stderr || r.stdout}`, hidden),
                ),
              }
            : {},
        (error: unknown) => ({ error }),
      );
      prompt.info("Dependencies are installing in the background.");
    };
    if (!flags.yes) await begin();
    // Notion-only unless GitHub sync is asked for explicitly (or already saved).
    const template: SetupAnswers["template"] = flags.template ?? saved.template ?? "notion";
    if (!flags.yes && login === "host" && !appUrl) {
      appUrl = await prompt.text("Your app's HTTPS URL (required for host login)", {
        validate: (value) => (value ? appUrlProblem(value) : "Host login needs your app URL."),
      });
    }
    if (login === "host") requireLogin({ login, appUrl }, oauth);
    if (appUrl && appUrlProblem(appUrl)) throw new CliError(appUrlProblem(appUrl)!, 2);
    if (saved.notionDataSourceId && appUrl !== saved.appUrl)
      throw new CliError(
        "Edit appUrl in feedbax.config.ts explicitly before resuming this configured project.",
        2,
      );
    const factories = overrides.clients ?? (await loadClients());
    const clients: Clients = {
      notion: (token) => factories.notion(token, fetchFn),
      github: (token) => factories.github(token, fetchFn),
    };
    const secrets: Secrets = {
      ...oauth,
      notionToken: env.NOTION_TOKEN ?? prior.NOTION_TOKEN ?? "",
      cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
      cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    };
    if (!flags.yes) {
      notionGuide(prompt);
      if (await prompt.confirm("Open the Notion setup links in your browser?", false)) {
        for (const link of [NOTION_TEMPLATE_URL, NOTION_INTEGRATION_URL]) {
          const command =
            process.platform === "darwin"
              ? "open"
              : process.platform === "win32"
                ? "explorer.exe"
                : "xdg-open";
          const result = await run(command, [link], { cwd });
          if (result.code)
            prompt.info("Could not open the browser. Open the links above to continue.");
        }
      }
    }
    const notionAuth = await validatedToken(
      "notion",
      secrets.notionToken || undefined,
      clients,
      prompt,
      flags.yes,
    );
    secrets.notionToken = notionAuth.token;
    hidden.push(notionAuth.token);
    if (!flags.yes) await ensureSecrets(cwd, secrets);
    const notion = notionAuth.client as NotionSetupClient;
    const target = await chooseNotion(
      notion,
      flags,
      prompt,
      () => {
        remote = true;
      },
      saved.notionDataSourceId,
    );
    let github: GitHubSetupClient | null = null;
    let githubRepo: string | undefined;
    if (template === "notion-github") {
      if (!flags.yes) githubGuide(prompt);
      const githubAuth = await validatedToken(
        "github",
        env.GITHUB_TOKEN ?? prior.GITHUB_TOKEN,
        clients,
        prompt,
        flags.yes,
      );
      secrets.githubToken = githubAuth.token;
      hidden.push(githubAuth.token);
      if (!flags.yes) await ensureSecrets(cwd, secrets);
      github = githubAuth.client as GitHubSetupClient;
      githubRepo = await chooseRepo(github, flags, prompt, saved.githubRepo);
    }
    // Anonymous feedback is on by default: no sign-in provider is needed to start.
    const anonymous = flags.anonymous ?? saved.anonymous ?? true;
    const isPrivate = flags.private ?? saved.private ?? false;
    if (flags.yes) await begin();
    const answers: SetupAnswers = {
      name,
      login,
      appUrl,
      template,
      anonymous,
      ...(isPrivate ? { private: true } : {}),
      packageManager: pm,
      notionDataSourceId: target.dataSourceId,
      githubRepo,
    };
    await ensureSecrets(cwd, secrets);
    await writeAppConfig(cwd, answers);
    const result = await setup(answers, secrets, {
      run,
      fetch: fetchFn,
      notion,
      github,
      prompt,
      cwd,
      yes: flags.yes,
      savedOAuthProviders,
      install,
      notionUrl: target.url,
      onRemote: () => {
        remote = true;
      },
      onSecret: (value) => hidden.push(value),
    });
    const loginStatus = isPrivate
      ? `Private board: every page needs a signed-in customer from ${appUrl}. Add the same-origin token endpoint and FeedbaxLink there using ${README_URL}, and pass visibility="customers" to FeedbaxDialog. Share FEEDBAX_HOST_SECRET server-side only. Run ${pm} run doctor to check the private-board settings.`
      : !login
        ? anonymous
          ? "Open the portal and post your first feedback. Anyone can post without an account; add sign-in later with npx feedbax add github-login."
          : "Anonymous posting is off and no sign-in is configured yet, so nobody can post. Add one with npx feedbax add github-login (or google-login, host-login)."
        : login === "host"
          ? `Host login integration pending. Add the same-origin authenticated token endpoint and FeedbaxLink in ${appUrl} using ${README_URL}. Share FEEDBAX_HOST_SECRET server-side only. Users can browse now; signed-in participation is ready after that connection is verified.`
          : `${login === "github" ? "GitHub" : "Google"} sign-in is configured. Open the portal, choose Continue with ${login === "github" ? "GitHub" : "Google"}, and submit your first feedback. OAuth callback, session and first-write verification remain.`;
    prompt.note(
      `Portal deployed: ${result.portalUrl}\n${loginStatus}\nNotion database: ${result.notionUrl}\n\ncd ${name}\n${pm} run dev        # http://localhost:3000\n${pm} run deploy     # publish changes\n${pm} run admin      # admin sign-in link (15 min, single use)\n${pm} run doctor     # check config, secrets and health\n\nMore: npx feedbax add github | github-login | google-login | host-login | email | webhooks\n\nSecrets: ${name}/.dev.vars (private, gitignored).${login && login !== "host" ? "\nUse a separate development OAuth App for localhost; keep production callback registration unchanged. Replace local OAuth credentials in .dev.vars for development and update production secrets explicitly; do not deploy localhost credentials over production." : ""}\nLocal posts sync to your real Notion database; delete test rows there.`,
      "Portal deployed",
    );
    prompt.outro(
      !login
        ? "Done. Open your portal and post the first feedback."
        : login === "host"
          ? "Host integration and first feedback verification remain."
          : "Complete sign-in and first feedback verification in your portal.",
    );
    return 0;
  } catch (error) {
    controller.abort();
    if (install) await install;
    if (error instanceof Cancelled || (error as Error)?.name === "AbortError") {
      if (created && !remote) await rm(cwd, { recursive: true, force: true });
      prompt.info(
        `Setup cancelled. Fix the problem above, then run the same command again.\nRetry: ${redact(retry, hidden)}`,
      );
      return 130;
    }
    prompt.error(
      redact(
        `${error instanceof Error ? error.message : "Setup could not finish."}\nFix the problem above, then run the same command again.\nRetry: ${retry}`,
        hidden,
      ),
    );
    return error instanceof CliError ? error.exitCode : 1;
  } finally {
    process.off("SIGINT", signal);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main();
