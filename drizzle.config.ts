import { defineConfig } from "drizzle-kit";

// Repo-only: used to generate migrations/0000_initial.sql, which is then hand-checked.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./.drizzle-out",
});
