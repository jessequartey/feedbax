import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export { schema };
function buildDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
export type Db = ReturnType<typeof buildDb>;
const clients = new WeakMap<D1Database, Db>();

/** Reuse schema construction only. Queries, bindings, results and D1 sessions stay fresh. */
export function createDb(d1: D1Database): Db {
  let db = clients.get(d1);
  if (!db) {
    db = buildDb(d1);
    clients.set(d1, db);
  }
  return db;
}
