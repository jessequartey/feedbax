// Comment- and format-preserving edits to wrangler.jsonc. The file is the user's: only the
// exact span that needs a structural change is rewritten; IDs, names, routes and vars stay.
import { CliError } from "../../create-feedbax/src/flags.ts";
import { parseJsonc, withoutComments } from "../../create-feedbax/src/jsonc.ts";

type Span = { start: number; end: number };

/** Find the value span at `path` in JSONC text (comments blanked, offsets preserved). */
export function findValueSpan(clean: string, path: string[]): Span | null {
  let index = 0;
  let result: Span | null = null;
  const ws = () => {
    while (index < clean.length && /\s/.test(clean[index]!)) index++;
  };
  const string = () => {
    const begin = index++;
    while (index < clean.length && clean[index] !== '"') index += clean[index] === "\\" ? 2 : 1;
    index++;
    return JSON.parse(clean.slice(begin, index)) as string;
  };
  const value = (depth: number, onPath: boolean): void => {
    ws();
    const start = index;
    const char = clean[index];
    if (char === "{" || char === "[") {
      const close = char === "{" ? "}" : "]";
      index++;
      for (;;) {
        ws();
        if (index >= clean.length) throw new CliError("wrangler.jsonc is not valid JSONC.", 2);
        if (clean[index] === close) break;
        if (clean[index] === ",") {
          index++;
          continue;
        }
        if (char === "[") {
          value(depth + 1, false);
          continue;
        }
        if (clean[index] !== '"') throw new CliError("wrangler.jsonc has unquoted keys.", 2);
        const key = string();
        ws();
        index++; // the colon
        value(depth + 1, onPath && depth < path.length && key === path[depth]);
      }
      index++;
    } else if (char === '"') string();
    else while (index < clean.length && !/[\s,\]}]/.test(clean[index]!)) index++;
    if (onPath && depth === path.length) result = { start, end: index };
  };
  value(0, true);
  return result;
}

/**
 * Ensure `assets.run_worker_first` routes `route` to the Worker. Idempotent: returns the
 * same text when the route (or `true`, meaning every route) is already there.
 */
export function ensureRunWorkerFirst(text: string, route: string): string {
  let config: { assets?: { run_worker_first?: unknown } };
  try {
    config = parseJsonc(text) as typeof config;
  } catch {
    throw new CliError("wrangler.jsonc is not valid JSONC. Fix its syntax and retry.", 2);
  }
  const current = config.assets?.run_worker_first;
  if (current === true) return text;
  if (Array.isArray(current) && current.includes(route)) return text;
  const manual = `Add "${route}" to assets.run_worker_first in wrangler.jsonc, then retry.`;
  if (!Array.isArray(current)) throw new CliError(manual, 2);
  const clean = withoutComments(text, true);
  const span = findValueSpan(clean, ["assets", "run_worker_first"]);
  if (!span || clean[span.start] !== "[") throw new CliError(manual, 2);
  const close = span.end - 1;
  let last = close - 1;
  while (last > span.start && /\s/.test(clean[last]!)) last--;
  const literal = JSON.stringify(route);
  if (last === span.start)
    return `${text.slice(0, span.start + 1)}${literal}${text.slice(span.start + 1)}`;
  const multiline = clean.slice(span.start, close).includes("\n");
  const trailingComma = clean[last] === ",";
  let elementEnd = trailingComma ? last - 1 : last;
  while (/\s/.test(clean[elementEnd]!)) elementEnd--;
  const lineStart = clean.lastIndexOf("\n", elementEnd) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
  const insertion = multiline
    ? trailingComma
      ? `\n${indent}${literal},`
      : `,\n${indent}${literal}`
    : trailingComma
      ? ` ${literal},`
      : `, ${literal}`;
  const at = trailingComma ? last + 1 : elementEnd + 1;
  return `${text.slice(0, at)}${insertion}${text.slice(at)}`;
}
