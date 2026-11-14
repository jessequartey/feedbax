import { spawn } from "node:child_process";
import * as clack from "@clack/prompts";
import { Cancelled } from "./flags.ts";
import type { Prompter, Run } from "./types.ts";
export function redact(text: string, secrets: string[]): string {
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const form of new Set([
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
    ]))
      text = text.split(form).join("[redacted]");
  }
  return text
    .replace(/(?:ntn_|secret_|github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/(Bearer\s+)\S+/gi, "$1[redacted]");
}
export function createRunner(signal?: AbortSignal): Run {
  return (cmd, args, opts) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Cancelled());
        return;
      }
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: [opts.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        shell: false,
        signal,
      });
      let stdout = "",
        stderr = "";
      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      child.on("error", (error) => {
        reject(signal?.aborted ? new Cancelled() : error);
      });
      child.on("close", (code) => {
        if (signal?.aborted) reject(new Cancelled());
        else resolve({ code: code ?? 1, stdout, stderr });
      });
      if (opts.stdin !== undefined) {
        child.stdin?.on("error", () => {});
        child.stdin?.end(opts.stdin);
      }
    });
}
function answer<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new Cancelled();
  return value as T;
}
export function createPrompter(quiet = false): Prompter {
  return {
    intro: (message) => clack.intro(message),
    note: (message, title) => clack.note(message, title),
    info: (message) => clack.log.info(message),
    error: (message) => clack.log.error(message),
    outro: (message) => clack.outro(message),
    async text(message, options = {}) {
      if (quiet) throw new Error("Non-interactive setup needs an input. Run with explicit flags.");
      return answer<string>(
        await (options.secret
          ? clack.password({ message, validate: (v) => options.validate?.(v ?? "") })
          : clack.text({
              message,
              defaultValue: options.defaultValue,
              placeholder: options.defaultValue,
              validate: (v) => options.validate?.(v || options.defaultValue || ""),
            })),
      );
    },
    async select(message, options, initialValue) {
      if (quiet) throw new Error("Non-interactive setup needs an explicit choice.");
      return answer<string>(await clack.select({ message, options, initialValue }));
    },
    async confirm(message, initialValue = false) {
      if (quiet) throw new Error("Non-interactive setup cannot ask for confirmation.");
      return answer<boolean>(await clack.confirm({ message, initialValue }));
    },
    async step(message, action) {
      const spin = clack.spinner();
      spin.start(message);
      try {
        const value = await action();
        spin.stop(message);
        return value;
      } catch (error) {
        spin.stop(`${message} — stopped`);
        throw error;
      }
    },
  };
}
