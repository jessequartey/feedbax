// Test-only meter for the resource budget tests: wraps the local D1 binding to count the
// queries an operation issues and the rows they read and write (from D1's own `meta`), and
// counts external fetches and Queue sends. Selects that Drizzle runs through `raw()` (which
// has no meta) are re-run once through `all()` to read their row counts.
import { env } from "cloudflare:workers";
import { vi } from "vite-plus/test";
import { queue } from "../fixtures/cloudflare-workers.ts";

export type Usage = {
  queries: number;
  rowsRead: number;
  rowsWritten: number;
  fetches: number;
  queueSends: number;
  queueCalls: number;
  statements: string[];
};
type Meta = { rows_read?: number; rows_written?: number };
const real = env.DB;
let usage: Usage | null = null;
const statements = new WeakMap<object, D1PreparedStatement>();

function record(sql: string, meta: Meta | undefined) {
  if (!usage) return;
  usage.rowsRead += meta?.rows_read ?? 0;
  usage.rowsWritten += meta?.rows_written ?? 0;
  usage.statements.push(sql.replace(/\s+/g, " ").slice(0, 160));
}
function wrap(statement: D1PreparedStatement, sql: string): D1PreparedStatement {
  const select = /^\s*(select|with)\b/i.test(sql);
  const counted = <T>(run: () => Promise<T>, meta: (result: T) => Promise<Meta | undefined>) =>
    (async () => {
      if (usage) usage.queries += 1;
      const result = await run();
      record(sql, await meta(result));
      return result;
    })();
  const wrapped = {
    bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
    all: () =>
      counted(
        () => statement.all(),
        async (result) => result.meta,
      ),
    run: () =>
      counted(
        () => statement.run(),
        async (result) => result.meta,
      ),
    first: (column?: string) =>
      counted(
        () => (column ? statement.first(column) : statement.first()),
        async () => (select ? (await statement.all()).meta : undefined),
      ),
    raw: (options?: { columnNames?: boolean }) =>
      counted(
        () => statement.raw(options as { columnNames: true }),
        async () => (select ? (await statement.all()).meta : undefined),
      ),
  } as unknown as D1PreparedStatement;
  statements.set(wrapped, statement);
  return wrapped;
}
const metered = {
  prepare: (sql: string) => wrap(real.prepare(sql), sql),
  batch: async (list: D1PreparedStatement[]) => {
    if (usage) usage.queries += 1;
    const results = await real.batch(list.map((item) => statements.get(item) ?? item));
    for (const result of results) record("(batch item)", result.meta);
    return results;
  },
  exec: (sql: string) => real.exec(sql),
  dump: () => real.dump(),
  withSession: () => real.withSession(),
} as unknown as D1Database;

/** Run `operation` with the meter on and return what it used. */
export async function measure(operation: () => Promise<unknown>): Promise<Usage> {
  const fetchSpy = globalThis.fetch;
  const fetchCalls = vi.isMockFunction(fetchSpy) ? fetchSpy.mock.calls.length : 0;
  const sentBefore = queue.sent.length;
  let queueCalls = 0;
  const send = queue.send.bind(queue),
    sendBatch = queue.sendBatch.bind(queue);
  queue.send = async (message, options) => {
    queueCalls += 1;
    return send(message, options);
  };
  queue.sendBatch = async (messages) => {
    queueCalls += 1;
    for (const { body } of messages) await send(body);
  };
  usage = {
    queries: 0,
    rowsRead: 0,
    rowsWritten: 0,
    fetches: 0,
    queueSends: 0,
    queueCalls: 0,
    statements: [],
  };
  env.DB = metered;
  try {
    await operation();
    const result = usage;
    result.fetches = vi.isMockFunction(fetchSpy) ? fetchSpy.mock.calls.length - fetchCalls : 0;
    result.queueSends = queue.sent.length - sentBefore;
    result.queueCalls = queueCalls;
    return result;
  } finally {
    usage = null;
    env.DB = real;
    queue.send = send;
    queue.sendBatch = sendBatch;
  }
}
