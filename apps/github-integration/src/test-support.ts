import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";

export async function createTestStorage() {
  const runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  try {
    const database = await runtime.getD1Database("DB");
    const migrations = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).sort())
      await database.exec(
        (await readFile(new URL(file, migrations), "utf8"))
          .replace(/--[^\n]*/g, "")
          .replace(/\s+/g, " "),
      );
    return { runtime, database };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}

// Measure the real storage boundary, including first() and batch(), without
// replacing SQLite or making assertions about the text of implementation SQL.
export function meter(database: D1Database) {
  const totals = { reads: 0, writes: 0 };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const record = <
    T extends { meta: { rows_read: number; rows_written: number } },
  >(
    result: T,
  ) => {
    totals.reads += result.meta.rows_read;
    totals.writes += result.meta.rows_written;
    return result;
  };
  function statement(source: D1PreparedStatement): D1PreparedStatement {
    const measured = new Proxy(source, {
      get(target, key) {
        if (key === "bind")
          return (...values: unknown[]) => statement(target.bind(...values));
        if (key === "all") return async () => record(await target.all());
        if (key === "run") return async () => record(await target.run());
        if (key === "first")
          return async (column?: string) => {
            const result = record(await target.all());
            const row = result.results[0];
            return row ? (column === undefined ? row : row[column]) : null;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(measured, source);
    return measured;
  }
  return {
    totals,
    database: new Proxy(database, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => statement(target.prepare(sql));
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) =>
            (
              await target.batch(
                statements.map((item) => originals.get(item) ?? item),
              )
            ).map(record);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
}
