// Targeted, comment-preserving edits to feedbax.config.ts for `feedbax add`. Each edit must
// find exactly one unambiguous literal; otherwise it stops and names the manual edit.
import { execFile } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { CliError } from "../../create-feedbax/src/flags.ts";
import { withoutComments } from "../../create-feedbax/src/jsonc.ts";
import type { FeedbaxConfig } from "../../../src/contracts/config.ts";

const execFileAsync = promisify(execFile);
const CONFIG = "feedbax.config.ts";
const STRING = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;

function replaceOnce(
  text: string,
  pattern: RegExp,
  replacement: (match: RegExpExecArray) => string,
  manual: string,
): string {
  const clean = withoutComments(text, true);
  const matches = [...clean.matchAll(new RegExp(pattern.source, "g"))];
  if (matches.length !== 1) throw new CliError(`${manual} Edit ${CONFIG} by hand, then retry.`, 2);
  const match = matches[0]!;
  return (
    text.slice(0, match.index) +
    replacement(match as RegExpExecArray) +
    text.slice(match.index! + match[0].length)
  );
}

const has = (text: string, key: string) =>
  new RegExp(`["']?\\b${key}["']?\\s*:`).test(withoutComments(text));

/** integrations.github → { repo }. */
export function setGithubRepo(text: string, repo: string): string {
  return replaceOnce(
    text,
    /(["']?\bgithub["']?\s*:\s*)(?:false|\{[^{}]*\})/,
    (match) => `${match[1]}{ repo: ${JSON.stringify(repo)} }`,
    "Could not find `github: false` (or `github: { repo }`) under integrations.",
  );
}

/** auth → { anonymous: false, private: true }. Adds the auth block when it is absent. */
export function setPrivate(text: string): string {
  const value = "{ anonymous: false, private: true }";
  if (has(text, "auth"))
    return replaceOnce(
      text,
      /(["']?\bauth["']?\s*:\s*)\{[^{}]*\}/,
      (match) => `${match[1]}${value}`,
      "auth is not a plain object.",
    );
  return replaceOnce(
    text,
    /defineConfig\(\{/,
    () => `defineConfig({\n  auth: ${value},`,
    "Could not find defineConfig({.",
  );
}

/** appUrl: replace the literal, or add it at the top of defineConfig({ … }). */
export function setAppUrl(text: string, appUrl: string): string {
  if (has(text, "appUrl"))
    return replaceOnce(
      text,
      new RegExp(String.raw`(["']?\bappUrl["']?\s*:\s*)${STRING}`),
      (match) => `${match[1]}${JSON.stringify(appUrl)}`,
      "appUrl is not a plain string literal.",
    );
  return replaceOnce(
    text,
    /defineConfig\(\{/,
    () => `defineConfig({\n  appUrl: ${JSON.stringify(appUrl)},`,
    "Could not find defineConfig({.",
  );
}

/** notifications.email → { from }. Adds the notifications block before integrations if absent. */
export function setEmailFrom(text: string, from: string): string {
  const value = `{ from: ${JSON.stringify(from)} }`;
  if (has(text, "email"))
    return replaceOnce(
      text,
      /(["']?\bemail["']?\s*:\s*)(?:false|\{[^{}]*\})/,
      (match) => `${match[1]}${value}`,
      "notifications.email is not `false` or a plain { from } object.",
    );
  if (has(text, "notifications"))
    return replaceOnce(
      text,
      /(["']?\bnotifications["']?\s*:\s*\{)/,
      (match) => `${match[1]} email: ${value},`,
      "notifications is not a plain object.",
    );
  return replaceOnce(
    text,
    /(\n([ \t]*))(["']?\bintegrations["']?\s*:)/,
    (match) => `${match[1]}notifications: { email: ${value} },${match[1]}${match[3]}`,
    "Could not find integrations.",
  );
}

export async function editConfig(cwd: string, edit: (text: string) => string): Promise<boolean> {
  const prepared = await prepareConfigEdit(cwd, edit);
  await prepared.write();
  return prepared.changed;
}

/** Resolve every edit before the caller writes files or production secrets. */
export async function prepareConfigEdit(cwd: string, edit: (text: string) => string) {
  const path = join(cwd, CONFIG);
  const before = await readFile(path, "utf8");
  const after = edit(before);
  const config = await loadConfig(cwd, after);
  return {
    config,
    changed: after !== before,
    write: async () => {
      if (after !== before) await writeFile(path, after);
    },
  };
}

/**
 * Evaluate feedbax.config.ts the way the Worker does (its own defineConfig validation), in a
 * separate Node process with type stripping, so a broken config never crashes the CLI.
 */
export async function loadConfig(cwd: string, source?: string): Promise<FeedbaxConfig> {
  // Reports { config } or { error } on stdout, so Node's own crash output never leaks in.
  const script = [
    "import { registerHooks } from 'node:module';",
    "if (process.env.FEEDBAX_CONFIG_SOURCE !== undefined) registerHooks({",
    "  load(url, context, nextLoad) {",
    "    if (url === process.argv[1]) return { format: 'module-typescript', source: process.env.FEEDBAX_CONFIG_SOURCE, shortCircuit: true };",
    "    return nextLoad(url, context);",
    "  }",
    "});",
    "let out;",
    "try { out = { config: (await import(process.argv[1])).default }; }",
    "catch (e) { out = { error: e instanceof Error ? e.message : String(e) }; }",
    "process.stdout.write(JSON.stringify(out));",
  ].join("\n");
  let result: { config?: FeedbaxConfig; error?: string } = {};
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--no-warnings",
        "--input-type=module",
        "-e",
        script,
        pathToFileURL(await realpath(join(cwd, CONFIG))).href,
      ],
      {
        cwd,
        timeout: 20_000,
        env: { ...process.env, NODE_OPTIONS: "", FEEDBAX_CONFIG_SOURCE: source },
      },
    );
    result = JSON.parse(stdout) as typeof result;
  } catch {
    /* reported below */
  }
  if (result.config) return result.config;
  throw new CliError(
    result.error?.startsWith("Invalid feedbax.config.ts")
      ? result.error
      : `${CONFIG} could not be loaded${result.error ? `: ${result.error}` : ""}. Run npm run build to see the full error.`,
    2,
  );
}
