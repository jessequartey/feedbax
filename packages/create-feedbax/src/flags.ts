import type { PackageManager, SetupAnswers } from "./types.ts";
export class CliError extends Error {
  exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}
export class Cancelled extends CliError {
  constructor() {
    super("Setup cancelled.", 130);
  }
}
export function projectProblem(value: string): string | undefined {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(value))
    return "Use 2–40 lowercase letters, numbers or hyphens, starting with a letter.";
}
export function subdomainProblem(value: string): string | undefined {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
    return "Use 1–63 lowercase letters, numbers or hyphens; start and end with a letter or number.";
}
export function tokenProblem(value: string): string | undefined {
  if (!value || /\s/.test(value)) return "Paste the whole secret, without spaces or line breaks.";
}
export function repoProblem(value: string): string | undefined {
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value))
    return "Enter owner/repo, for example acme/website (not a URL).";
}
export function pageProblem(value: string): string | undefined {
  const id = /(?:[\da-f]{32}|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i;
  if (new RegExp(`^(?:${id.source})`, "i").test(value)) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      /(?:^|\.)(?:notion\.so|notion\.site|notion\.com)$/.test(url.hostname) &&
      id.test(url.pathname)
    )
      return;
  } catch {
    /* field hint below */
  }
  return "Paste a Notion page link or its 32-character page ID.";
}
export function appUrlProblem(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password) return "appUrl must not contain credentials.";
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      return;
  } catch {
    /* field-only error below */
  }
  return "appUrl must be an HTTPS URL (HTTP is allowed only for localhost development).";
}
export function portalOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !value.includes("?") &&
      !value.includes("#") &&
      url.pathname === "/"
    )
      return url.origin;
  } catch {
    /* field-only error below */
  }
  throw new CliError(
    "PORTAL_URL must be an HTTPS origin without credentials, query, fragment or a non-root path.",
    2,
  );
}
export type Flags = {
  name?: string;
  login?: SetupAnswers["login"];
  appUrl?: string;
  yes: boolean;
  template?: "notion" | "notion-github";
  notionPage?: string;
  githubRepo?: string;
  anonymous?: boolean;
  packageManager?: PackageManager;
  help: boolean;
  version: boolean;
};
export function parseFlags(argv: string[]): Flags {
  const result: Flags = { yes: false, help: false, version: false };
  const seen = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("-")) {
      if (result.name) throw new CliError("Give one project name.", 2);
      result.name = arg;
      continue;
    }
    if (["--yes", "--help", "--version"].includes(arg)) {
      if (seen.has(arg)) throw new CliError("Do not repeat flags.", 2);
      seen.add(arg);
      if (arg === "--yes") result.yes = true;
      if (arg === "--help") result.help = true;
      if (arg === "--version") result.version = true;
      continue;
    }
    const [key, ...rest] = arg.split("=");
    if (
      ![
        "--login",
        "--app-url",
        "--template",
        "--notion-page",
        "--github-repo",
        "--anonymous",
        "--package-manager",
      ].includes(key!)
    )
      throw new CliError(
        "Unknown flag. Run create-feedbax --help for supported flags. Secrets belong in environment variables.",
        2,
      );
    if (seen.has(key!)) throw new CliError("Do not repeat flags.", 2);
    seen.add(key!);
    const value = rest.length ? rest.join("=") : argv[++i];
    if (!value || value.startsWith("--")) throw new CliError(`${key} needs a value.`, 2);
    values[key!] = value;
  }
  if (result.help || result.version) return result;
  const check = (valid: boolean, message: string) => {
    if (!valid) throw new CliError(message, 2);
  };
  if (result.name) check(!projectProblem(result.name), projectProblem(result.name)!);
  if (values["--template"]) {
    check(
      ["notion", "notion-github"].includes(values["--template"]),
      "--template must be notion or notion-github.",
    );
    result.template = values["--template"] as Flags["template"];
  }
  if (values["--login"]) {
    check(
      ["github", "google", "host"].includes(values["--login"]),
      "--login must be github, google or host.",
    );
    result.login = values["--login"] as SetupAnswers["login"];
  }
  if (values["--app-url"]) {
    check(!appUrlProblem(values["--app-url"]), appUrlProblem(values["--app-url"])!);
    result.appUrl = values["--app-url"];
  }
  if (values["--package-manager"]) {
    check(
      ["npm", "pnpm", "bun"].includes(values["--package-manager"]),
      "--package-manager must be npm, pnpm or bun.",
    );
    result.packageManager = values["--package-manager"] as PackageManager;
  }
  if (values["--anonymous"]) {
    check(["true", "false"].includes(values["--anonymous"]), "--anonymous must be true or false.");
    result.anonymous = values["--anonymous"] === "true";
  }
  if (values["--notion-page"]) {
    check(!pageProblem(values["--notion-page"]), pageProblem(values["--notion-page"])!);
    result.notionPage = values["--notion-page"];
  }
  if (values["--github-repo"]) {
    check(!repoProblem(values["--github-repo"]), repoProblem(values["--github-repo"])!);
    result.githubRepo = values["--github-repo"];
  }
  if (result.template === "notion" && result.githubRepo)
    throw new CliError("--github-repo requires --template notion-github.", 2);
  return result;
}
export function detectPackageManager(agent = ""): PackageManager {
  return agent.startsWith("pnpm/") ? "pnpm" : agent.startsWith("bun/") ? "bun" : "npm";
}
export const HELP = `create-feedbax — a live feedback portal with a Notion dashboard

Usage: create-feedbax [name] [options]
  --yes                         Never prompt or open a browser
  --template notion|notion-github
  --notion-page <id-or-url>      Fallback if no unique template is found
  --github-repo owner/repo
  --login github|google|host     Optional; default: none (add later: npx feedbax add github-login)
  --app-url <https-url>          Required for host login
  --anonymous true|false         Default: true
  --package-manager npm|pnpm|bun  Default: your package manager
  --help                        Offline help
  --version                     Offline version

Defaults: Notion template, anonymous feedback on, no sign-in provider.
Node 24.15+ is required. CI: set NOTION_TOKEN, CLOUDFLARE_API_TOKEN and
CLOUDFLARE_ACCOUNT_ID, then run with --yes. That is all.
Add-ons come after, from the project: npx feedbax add github | github-login |
google-login | host-login | email | webhooks. (--template notion-github and
--login are shortcuts for the first two; they need GITHUB_TOKEN, or GITHUB_CLIENT_ID +
GITHUB_CLIENT_SECRET / GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.)
Secrets never go in flags. Run the same command again to finish an interrupted setup.`;
