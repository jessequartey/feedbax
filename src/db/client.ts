import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export { schema };
export type Db = ReturnType<typeof createDb>;

/** One Drizzle client per request or batch of work; it is a thin wrapper over the D1 binding. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
