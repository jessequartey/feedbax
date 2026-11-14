#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
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
    .filter(([key]) => /TOKEN|SECRET|PASSWORD|API_KEY/.test(key))
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
    if (flags.yes) {
      const missing = [
        !flags.name && "a project name",
        !env.NOTION_TOKEN && "NOTION_TOKEN",
        !env.CLOUDFLARE_API_TOKEN && "CLOUDFLARE_API_TOKEN",
        !env.CLOUDFLARE_ACCOUNT_ID && "CLOUDFLARE_ACCOUNT_ID",
        flags.template === "notion-github" && !env.GITHUB_TOKEN && "GITHUB_TOKEN",
        flags.template === "notion-github" && !flags.githubRepo && "--github-repo",
      ].filter(Boolean);
      // Saved .dev.vars may supply provider tokens on a rerun.
      const saved = flags.name
        ? await readVars(join(overrides.cwd ?? process.cwd(), flags.name))
        : {};
      const required = missing.filter(
        (item) =>
          !(item === "NOTION_TOKEN" && saved.NOTION_TOKEN) &&
          !(item === "GITHUB_TOKEN" && saved.GITHUB_TOKEN),
      );
      if (required.length)
        throw new CliError(`Non-interactive setup needs ${required.join(", ")}.`, 2);
    } else if (!process.stdin.isTTY && !overrides.prompt)
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
    const resume = await exists(join(cwd, "feedbax.config.ts"));
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
    const template =
      flags.template ??
      saved.template ??
      ((flags.yes
        ? "notion"
        : await prompt.select(
            "Template",
            [
              { value: "notion", label: "Notion", hint: "Team dashboard" },
              {
                value: "notion-github",
                label: "Notion + GitHub",
                hint: "Dashboard + approved issues",
              },
            ],
            "notion",
          )) as SetupAnswers["template"]);
    const factories = overrides.clients ?? (await loadClients());
    const clients: Clients = {
      notion: (token) => factories.notion(token, fetchFn),
      github: (token) => factories.github(token, fetchFn),
    };
    const secrets: Secrets = {
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
    const anonymous =
      flags.anonymous ??
      saved.anonymous ??
      (flags.yes ? false : await prompt.confirm("Let people post without an account?", false)) ??
      false;
    if (flags.yes) await begin();
    const answers: SetupAnswers = {
      name,
      template,
      anonymous,
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
      install,
      notionUrl: target.url,
      onRemote: () => {
        remote = true;
      },
    });
    prompt.note(
      `Your feedback portal is live: ${result.portalUrl}\nNotion database: ${result.notionUrl}\n\ncd ${name}\n${pm} run dev        # http://localhost:3000\n${pm} run deploy     # publish changes\n\nSecrets: ${name}/.dev.vars (private, gitignored)\nFEEDBAX_HOST_SECRET is there when you embed the block.\n\n1. Submit your first post and check the Notion dashboard.\n2. Embed the feedback dialog: ${README_URL}\n3. Set appUrl in feedbax.config.ts, then publish changes.\n\nLocal posts sync to your real Notion database; delete test rows there.`,
      "You're live",
    );
    prompt.outro("Ready for feedback.");
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
