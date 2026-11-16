import { chmod, cp, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { withoutComments } from "./jsonc.ts";
import { CliError } from "./flags.ts";
import type { Secrets, SetupAnswers } from "./types.ts";
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
export async function readVars(cwd: string): Promise<Record<string, string>> {
  if (!(await exists(join(cwd, ".dev.vars")))) return {};
  const result: Record<string, string> = {};
  for (const line of (await readFile(join(cwd, ".dev.vars"), "utf8")).split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      const value = match[2]!;
      try {
        const parsed: unknown = value.startsWith('"')
          ? JSON.parse(value)
          : value.startsWith("'") && value.endsWith("'")
            ? value.slice(1, -1)
            : value;
        if (typeof parsed !== "string") throw new Error("invalid value");
        result[match[1]!] = parsed;
      } catch {
        throw new CliError(
          'A value in .dev.vars is malformed. Use KEY="value" on each line, then retry.',
          2,
        );
      }
    }
  }
  return result;
}
export async function writeVars(cwd: string, vars: Record<string, string>): Promise<void> {
  const path = join(cwd, ".dev.vars");
  if (await exists(path)) await chmod(path, 0o600);
  await writeFile(
    path,
    Object.entries(vars)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  await chmod(path, 0o600);
  const ignorePath = join(cwd, ".gitignore");
  const ignore = (await exists(ignorePath)) ? await readFile(ignorePath, "utf8") : "";
  if (!ignore.split(/\r?\n/).some((line) => [".dev.vars", "/.dev.vars"].includes(line.trim())))
    await writeFile(ignorePath, `${ignore}\n.dev.vars\n`);
}
export async function scaffold(
  cwd: string,
  templateDir: string,
  name: string,
): Promise<{ created: boolean; resume: boolean }> {
  const present = await exists(cwd);
  if (present && (await readdir(cwd)).length) {
    if (
      !(await exists(join(cwd, "feedbax.config.ts"))) ||
      !(await exists(join(cwd, "package.json")))
    )
      throw new CliError(
        "This directory is not an unfinished Feedbax project. Pick a different project name.",
        2,
      );
    return { created: false, resume: true };
  }
  await mkdir(cwd, { recursive: true });
  await cp(templateDir, cwd, { recursive: true });
  if (await exists(join(cwd, "_gitignore")))
    await rename(join(cwd, "_gitignore"), join(cwd, ".gitignore"));
  const pkgPath = join(cwd, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = name;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  return { created: !present, resume: false };
}
export async function ensureSecrets(
  cwd: string,
  tokens: Partial<Secrets>,
): Promise<Record<string, string>> {
  const vars = await readVars(cwd);
  vars.BETTER_AUTH_SECRET ||= randomBytes(32).toString("base64url");
  vars.FEEDBAX_HOST_SECRET ||= randomBytes(32).toString("base64url");
  vars.PORTAL_URL = "http://localhost:3000";
  if (tokens.notionToken) vars.NOTION_TOKEN = tokens.notionToken;
  if (tokens.githubToken) vars.GITHUB_TOKEN = tokens.githubToken;
  for (const [field, key] of Object.entries({
    githubClientId: "GITHUB_CLIENT_ID",
    githubClientSecret: "GITHUB_CLIENT_SECRET",
    googleClientId: "GOOGLE_CLIENT_ID",
    googleClientSecret: "GOOGLE_CLIENT_SECRET",
  })) {
    const value = tokens[field as keyof Secrets];
    if (value) vars[key] = value;
  }
  await writeVars(cwd, vars);
  return vars;
}
export async function writeAppConfig(cwd: string, answers: SetupAnswers): Promise<void> {
  const path = join(cwd, "feedbax.config.ts");
  const original = await readFile(path, "utf8");
  const saved = await savedAnswers(cwd);
  if (saved.notionDataSourceId) {
    if (answers.appUrl !== saved.appUrl)
      throw new CliError(
        "Edit appUrl in feedbax.config.ts explicitly before resuming this configured project.",
        2,
      );
    return;
  }
  if (/\.\.\./.test(withoutComments(original)))
    throw new CliError(
      "Edit the customized feedbax.config.ts explicitly; setup cannot safely fill a scaffold containing spreads.",
      2,
    );
  let config = original;
  const replace = (pattern: RegExp, replacement: (match: RegExpExecArray) => string) => {
    const clean = withoutComments(config, true);
    const matches = [...clean.matchAll(new RegExp(pattern.source, "g"))];
    if (matches.length !== 1)
      throw new CliError(
        "Customized feedbax.config.ts needs an explicit edit before setup can resume safely.",
        2,
      );
    const match = matches[0]!;
    config =
      config.slice(0, match.index) +
      replacement(match) +
      config.slice(match.index! + match[0].length);
  };
  if (/["']?name["']?\s*:\s*["']Feedbax["']/.test(withoutComments(config)))
    replace(
      /(["']?name["']?\s*:\s*)["']Feedbax["']/,
      (match) => `${match[1]}${JSON.stringify(answers.name)}`,
    );
  replace(
    /(["']?dataSourceId["']?\s*:\s*)["']0{8}-0{4}-0{4}-0{4}-0{12}["']/,
    (match) => `${match[1]}${JSON.stringify(answers.notionDataSourceId)}`,
  );
  replace(
    /(["']?anonymous["']?\s*:\s*)(?:true|false)/,
    (match) =>
      `${match[1]}${answers.anonymous}${
        answers.private && !/["']?private["']?\s*:/.test(withoutComments(original))
          ? ", private: true"
          : ""
      }`,
  );
  if (answers.githubRepo)
    replace(
      /(["']?github["']?\s*:\s*)false/,
      (match) => `${match[1]}${JSON.stringify({ repo: answers.githubRepo })}`,
    );
  // Insertion is safe only at the unambiguous literal defineConfig object opening.
  if (answers.appUrl && !saved.appUrl)
    replace(
      /defineConfig\(\{/,
      () => `defineConfig({\n  appUrl: ${JSON.stringify(answers.appUrl)},`,
    );
  await writeFile(path, config);
}

export async function savedAnswers(cwd: string): Promise<Partial<SetupAnswers>> {
  if (!(await exists(join(cwd, "feedbax.config.ts")))) return {};
  const config = withoutComments(await readFile(join(cwd, "feedbax.config.ts"), "utf8"));
  const id = /["']?dataSourceId["']?\s*:\s*["']([a-f0-9-]+)["']/i.exec(config)?.[1];
  const appField = /["']?appUrl["']?\s*:/.test(config);
  const appLiteral = /["']?appUrl["']?\s*:\s*("(?:[^"\\]|\\.)*"|'[^'\\]*')\s*(?:,|})/.exec(
    config,
  )?.[1];
  let appUrl: string | undefined;
  if (appLiteral) {
    try {
      appUrl = appLiteral.startsWith('"')
        ? (JSON.parse(appLiteral) as string)
        : appLiteral.slice(1, -1);
    } catch {
      /* require an explicit literal below */
    }
  }
  if (appField && !appUrl)
    throw new CliError(
      "Cannot safely read appUrl in feedbax.config.ts. Use a plain URL string before resuming setup.",
      2,
    );
  if (!id || id.replaceAll("-", "") === "0".repeat(32)) return { appUrl };
  const repo = /["']?repo["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1];
  return {
    appUrl,
    notionDataSourceId: id?.replace(/-/g, "") !== "0".repeat(32) ? id : undefined,
    githubRepo: repo,
    template: repo ? "notion-github" : "notion",
    anonymous: /["']?anonymous["']?\s*:\s*true/.test(config),
    private: /["']?private["']?\s*:\s*true/.test(config),
  };
}
