import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { parse, type ParseError } from "jsonc-parser";
import { defineFeedbax, type FeedbaxConfig } from "../../config/src/index";

export async function readLocalEnvironment(
  cwd: string,
): Promise<Record<string, string>> {
  let contents: string;
  try {
    contents = await readFile(join(cwd, ".dev.vars"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return Object.fromEntries(
    contents.split(/\r?\n/).flatMap((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) return [];
      try {
        return [[match[1]!, String(JSON.parse(match[2]!))]];
      } catch {
        return [[match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, "$2")]];
      }
    }),
  );
}

export async function loadInstallationConfig(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<FeedbaxConfig> {
  const result = await build({
    absWorkingDir: cwd,
    entryPoints: [join(cwd, "src/feedbax.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    define: { "process.env": JSON.stringify(env) },
  });
  const code = result.outputFiles[0]!.text;
  return defineFeedbax(
    (
      await import(
        `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
      )
    ).default,
  );
}

export type WranglerConfiguration = {
  name?: string;
  account_id?: string;
  routes?: (string | { pattern: string; custom_domain?: boolean })[];
  ratelimits?: { name: string }[];
};
export async function readWranglerConfiguration(
  cwd: string,
): Promise<WranglerConfiguration> {
  const errors: ParseError[] = [];
  const config = parse(
    await readFile(join(cwd, "wrangler.jsonc"), "utf8"),
    errors,
    { allowTrailingComma: true },
  );
  if (errors.length || !config || typeof config !== "object")
    throw new Error("wrangler.jsonc is not valid JSONC.");
  return config;
}
