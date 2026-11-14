import { mkdtemp, chmod, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitHubSetupClient, NotionSetupClient } from "../../../src/contracts/integrations.ts";
import { CliError, portalOrigin, subdomainProblem } from "./flags.ts";
import { redact } from "./io.ts";
import { parseJsonc } from "./jsonc.ts";
import { verifyDeployment, viewerRpcId } from "./verify.ts";
import { loginCheckpoint } from "./login.ts";
import { ensureSecrets } from "./project.ts";
import type { PackageManager, Prompter, Run, Secrets, SetupAnswers } from "./types.ts";

export function execCommand(pm: PackageManager, tool: string, args: string[]): [string, string[]] {
  return pm === "pnpm"
    ? ["pnpm", ["exec", tool, ...args]]
    : pm === "bun"
      ? ["bunx", ["--no-install", tool, ...args]]
      : ["npx", ["--no-install", tool, ...args]];
}
export function parseJsonOutput<T>(text: string): T {
  // Pinned Wrangler JSON commands emit a JSON document, sometimes after a banner.
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== "{" && character !== "[") continue;
    try {
      return JSON.parse(text.slice(index)) as T;
    } catch {
      /* try the next opening delimiter */
    }
  }
  throw new CliError(
    "Wrangler returned an unreadable response. Update to the bundled Wrangler and retry.",
  );
}
type Account = { id: string; name: string };
type WranglerConfig = {
  name: string;
  account_id?: string;
  assets?: Record<string, unknown>;
  observability?: Record<string, unknown>;
  vars: { PORTAL_URL: string };
  d1_databases: {
    binding: string;
    database_name: string;
    database_id: string;
    migrations_dir: string;
  }[];
  r2_buckets: { binding: string; bucket_name: string }[];
  queues: {
    producers: { binding: string; queue: string }[];
    consumers: {
      queue: string;
      max_batch_size: number;
      max_concurrency: number;
      max_retries: number;
    }[];
  };
  [key: string]: unknown;
};
export type SetupDeps = {
  run: Run;
  fetch: typeof fetch;
  notion: NotionSetupClient;
  github: GitHubSetupClient | null;
  prompt: Prompter;
  cwd?: string;
  yes?: boolean;
  install?: Promise<void | { error?: unknown }>;
  notionUrl?: string;
  onRemote?: () => void;
  onSecret?: (value: string) => void;
};
const R2_GUIDE =
  "R2 isn't enabled on this account. Open https://dash.cloudflare.com/?to=/:account/r2/overview and click Enable R2 (the free tier needs a payment method on file). Press Enter when done.";
export async function setup(
  answers: SetupAnswers,
  secrets: Secrets,
  deps: SetupDeps,
): Promise<{ portalUrl: string; notionUrl: string }> {
  const cwd = deps.cwd ?? process.cwd();
  const { prompt, yes } = deps;
  let vars = await ensureSecrets(cwd, secrets);
  const hidden = [...Object.values(vars), secrets.cloudflareApiToken ?? ""];
  const clean = (value: string) => redact(value, hidden);
  const env: Record<string, string> = { CI: "true", WRANGLER_SEND_METRICS: "false" };
  if (secrets.cloudflareApiToken) env.CLOUDFLARE_API_TOKEN = secrets.cloudflareApiToken;
  if (secrets.cloudflareAccountId) env.CLOUDFLARE_ACCOUNT_ID = secrets.cloudflareAccountId;
  const invoke = async (args: string[]) => {
    const [cmd, flags] = execCommand(answers.packageManager, "wrangler", args);
    return deps.run(cmd, flags, { cwd, env });
  };
  const wrangler = async (args: string[]) => {
    const result = await invoke(args);
    if (result.code)
      throw new CliError(
        clean(`${args.slice(0, 3).join(" ")} failed.\n${result.stderr || result.stdout}`),
      );
    return result.stdout;
  };
  // Local tools must be installed before OAuth or any resource command can run.
  await prompt.step("Install dependencies", async () => {
    const installed = await deps.install;
    if (installed?.error) throw installed.error;
  });
  let accountId = secrets.cloudflareAccountId;
  let apiToken = secrets.cloudflareApiToken;
  await prompt.step("Cloudflare login / check", async () => {
    let identity = await invoke(["whoami", "--json"]);
    if (identity.code || !identity.stdout.includes('"accounts"')) {
      if (yes)
        throw new CliError(
          "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to a valid Cloudflare account.",
          2,
        );
      prompt.info("Opening your browser to log in to Cloudflare…");
      await wrangler(["login"]);
      identity = await invoke(["whoami", "--json"]);
    }
    if (identity.code)
      throw new CliError(
        "Cloudflare login could not be verified. Sign in to the intended account and retry.",
      );
    const data = parseJsonOutput<{ accounts: Account[] }>(identity.stdout);
    if (!accountId) {
      if (!data.accounts?.length)
        throw new CliError(
          "No Cloudflare account was found. Create an account at https://dash.cloudflare.com/sign-up.",
        );
      accountId =
        data.accounts.length === 1
          ? data.accounts[0]!.id
          : yes
            ? undefined
            : await prompt.select(
                "Which Cloudflare account?",
                data.accounts.map((a) => ({ value: a.id, label: a.name })),
              );
    }
    if (!accountId)
      throw new CliError("Set CLOUDFLARE_ACCOUNT_ID to choose the Cloudflare account.", 2);
    env.CLOUDFLARE_ACCOUNT_ID = accountId;
    if (!apiToken) {
      const auth = parseJsonOutput<{ token?: string; api_token?: string }>(
        await wrangler(["auth", "token", "--json"]),
      );
      apiToken = auth.token ?? auth.api_token;
    }
    if (!apiToken)
      throw new CliError(
        "Wrangler did not return an API token. Run the project's local wrangler login, then retry.",
      );
    hidden.push(apiToken);
  });
  const api = async (
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<{
    ok: boolean;
    status: number;
    result: unknown;
    errors: { code?: number; message?: string }[];
  }> => {
    const response = await deps.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await response.json()) as {
      success: boolean;
      result: unknown;
      errors?: { code?: number; message?: string }[];
    };
    return {
      ok: response.ok && data.success,
      status: response.status,
      result: data.result,
      errors: data.errors ?? [],
    };
  };
  const waitR2 = async () => {
    if (yes) throw new CliError(R2_GUIDE);
    prompt.note(R2_GUIDE, "Enable image storage");
    await prompt.text("Press Enter when R2 is enabled", { defaultValue: "" });
  };
  let buckets: { name: string }[] = [];
  // A read-only R2 preflight catches activation before creating any resource.
  while (true) {
    const response = await api("/r2/buckets?per_page=1000");
    if (response.ok) {
      buckets = (response.result as { buckets: { name: string }[] }).buckets;
      break;
    }
    if (
      response.errors.some(
        (e) => /enable|not enabled|activate|payment/i.test(e.message ?? "") || e.code === 10042,
      )
    ) {
      await waitR2();
      continue;
    }
    throw new CliError(
      "Could not check R2. Check that the Cloudflare account has R2 access and retry.",
    );
  }
  let subdomain = "";
  while (!subdomain) {
    const response = await api("/workers/subdomain");
    if (response.ok)
      subdomain = (response.result as { subdomain?: string } | null)?.subdomain ?? "";
    if (subdomain) break;
    const guide = `Choose a workers.dev subdomain at https://dash.cloudflare.com/${accountId}/workers-and-pages (Workers & Pages → your subdomain).`;
    if (yes) throw new CliError(`${guide} Run the same command again once it is registered.`);
    if (!response.ok && response.status !== 404) {
      prompt.note(guide, "workers.dev");
      await prompt.text("Press Enter when your subdomain is ready", { defaultValue: "" });
      continue;
    }
    const value = await prompt.text("Pick your workers.dev subdomain", {
      defaultValue: answers.name,
      validate: subdomainProblem,
    });
    const register = await api("/workers/subdomain", "PUT", { subdomain: value });
    if (register.ok) {
      subdomain = value;
      break;
    }
    if (register.errors.some((e) => /taken|already|available|exist/i.test(e.message ?? ""))) {
      prompt.info("That subdomain is taken. Pick another name.");
      continue;
    }
    prompt.note(guide, "Finish registering your subdomain");
    await prompt.text("Press Enter when your subdomain is ready", { defaultValue: "" });
  }
  const workersUrl = `https://${answers.name}.${subdomain}.workers.dev`;
  let config: WranglerConfig | undefined;
  try {
    config = parseJsonc(await readFile(join(cwd, "wrangler.jsonc"), "utf8")) as WranglerConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new CliError(
        "Could not read wrangler.jsonc. Fix its JSONC syntax before rerunning setup.",
        2,
      );
  }
  const ownsResources = config?.name === answers.name && config?.account_id === accountId;
  const savedPortal = ownsResources ? config?.vars?.PORTAL_URL : undefined;
  const portalUrl = portalOrigin(
    savedPortal && /^https:/i.test(savedPortal) ? savedPortal : workersUrl,
  );
  await prompt.step("Configure sign-in", () =>
    loginCheckpoint(
      answers,
      secrets,
      portalUrl,
      prompt,
      Boolean(yes),
      (value) => {
        hidden.push(value);
        deps.onSecret?.(value);
      },
      async () => {
        vars = await ensureSecrets(cwd, secrets);
        hidden.push(...Object.values(vars));
      },
    ),
  );
  // Refresh the early snapshot even when credentials came from saved vars or explicit env.
  vars = await ensureSecrets(cwd, secrets);
  hidden.push(...Object.values(vars));
  const dbName = ownsResources ? config!.d1_databases[0]!.database_name : `${answers.name}-db`;
  const bucketName = ownsResources ? config!.r2_buckets[0]!.bucket_name : `${answers.name}-images`;
  const queueName = ownsResources ? config!.queues.producers[0]!.queue : `${answers.name}-sync`;
  const databases = parseJsonOutput<{ uuid: string; name: string }[]>(
    await wrangler(["d1", "list", "--json"]),
  );
  const queues: { queue_name: string }[] = [];
  for (let page = 1; ; page++) {
    const response = await api(`/queues?per_page=100&page=${page}`);
    if (!response.ok)
      throw new CliError(
        "Could not list Cloudflare Queues. Give the account token Queues read/write access and retry.",
      );
    const batch = response.result as { queue_name: string }[];
    queues.push(...batch);
    if (batch.length < 100) break;
  }
  const database = databases.find((item) => item.name === dbName);
  const bucket = buckets.find((item) => item.name === bucketName);
  const queue = queues.find((item) => item.queue_name === queueName);
  if (!ownsResources && (database || bucket || queue))
    throw new CliError(
      "This project name already has Cloudflare resources. Choose a different project name; no resources were created.",
      2,
    );
  if (ownsResources) deps.onRemote?.();
  config = {
    ...(ownsResources ? config : {}),
    $schema: "node_modules/wrangler/config-schema.json",
    name: answers.name,
    account_id: accountId,
    main: "src/server.ts",
    compatibility_date: "2026-11-13",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      ...(ownsResources ? config?.assets : {}),
      not_found_handling: "single-page-application",
      // Auth callbacks and RPCs must reach the Worker even for browser navigation.
      run_worker_first: ["/api/*", "/_serverFn/*"],
    },
    observability: {
      ...(ownsResources ? config?.observability : {}),
      enabled: true,
      redact_query_string: true,
    },
    vars: {
      ...(ownsResources ? config!.vars : {}),
      PORTAL_URL: portalUrl,
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: dbName,
        database_id: database?.uuid ?? "00000000-0000-0000-0000-000000000000",
        migrations_dir: "migrations",
      },
    ],
    r2_buckets: [{ binding: "IMAGES", bucket_name: bucketName }],
    queues: {
      producers: [{ binding: "SYNC_QUEUE", queue: queueName }],
      consumers: [{ queue: queueName, max_batch_size: 1, max_concurrency: 1, max_retries: 10 }],
    },
    triggers: { crons: ["*/5 * * * *"] },
  };
  const save = () => writeFile(join(cwd, "wrangler.jsonc"), JSON.stringify(config, null, 2) + "\n");
  // Persist ownership before a possibly successful request whose response could be lost.
  await save();
  await prompt.step("D1 create", async () => {
    let ownedDatabase = database;
    if (!database) {
      deps.onRemote?.();
      await wrangler(["d1", "create", dbName]);
      ownedDatabase = parseJsonOutput<{ uuid: string; name: string }[]>(
        await wrangler(["d1", "list", "--json"]),
      ).find((item) => item.name === dbName);
    }
    if (!ownedDatabase || !/^[a-f0-9-]{32,36}$/i.test(ownedDatabase.uuid))
      throw new CliError("D1 returned no database ID. Retry to adopt the existing database.");
    // Wrangler resolves matching config bindings before remote names. Persist the real ID
    // before asking for info, so first setup never resolves the scaffold's zero placeholder.
    config!.d1_databases[0]!.database_id = ownedDatabase.uuid;
    await save();
    const info = parseJsonOutput<{ uuid: string }>(
      await wrangler(["d1", "info", ownedDatabase.uuid, "--json"]),
    );
    if (info.uuid !== ownedDatabase.uuid)
      throw new CliError(
        "D1 returned a different database ID. Check the project binding and retry.",
      );
  });
  await prompt.step("R2 create", async () => {
    if (bucket) return;
    while (true) {
      deps.onRemote?.();
      const result = await invoke(["r2", "bucket", "create", bucketName]);
      if (!result.code) return;
      if (/enable R2|R2.*not enabled|10042|activate R2/i.test(result.stderr + result.stdout)) {
        await waitR2();
        continue;
      }
      throw new CliError(clean(`R2 create failed.\n${result.stderr || result.stdout}`));
    }
  });
  await prompt.step("Queue create", async () => {
    if (!queue) {
      deps.onRemote?.();
      await wrangler(["queues", "create", queueName]);
    }
  });
  await prompt.step("Write config", async () => {
    await save();
  });
  await prompt.step("Migrate D1 (local + remote)", async () => {
    await wrangler(["d1", "migrations", "apply", "DB", "--local"]);
    await wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
  });
  await prompt.step("Build + deploy", async () => {
    const build = await deps.run(answers.packageManager, ["run", "build"], { cwd, env });
    if (build.code) throw new CliError(clean(`Build failed.\n${build.stderr || build.stdout}`));
    await viewerRpcId(cwd);
    const secretDir = await mkdtemp(join(tmpdir(), "feedbax-secrets-"));
    await chmod(secretDir, 0o700);
    const secretFile = join(secretDir, "secrets.json");
    try {
      const production = Object.fromEntries(
        Object.entries(vars).filter(([key]) => key !== "PORTAL_URL"),
      );
      await writeFile(secretFile, JSON.stringify(production), { mode: 0o600 });
      await wrangler(["deploy", "--secrets-file", secretFile]);
    } finally {
      await rm(secretDir, { recursive: true, force: true });
    }
  });
  await prompt.step("Check deployed health and sign-in wiring", async () => {
    try {
      await verifyDeployment(cwd, portalUrl, answers, secrets, deps.fetch);
    } catch {
      throw new CliError(
        "Portal deployed, but health/sign-in wiring verification failed. Check the production URL, provider credentials and deployment, then retry. OAuth session and first-write verification remain.",
      );
    }
  });
  return {
    portalUrl: config.vars.PORTAL_URL,
    notionUrl:
      deps.notionUrl ?? `https://www.notion.so/${answers.notionDataSourceId.replaceAll("-", "")}`,
  };
}
