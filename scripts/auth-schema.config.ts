// Input for the one-time Better Auth schema generation. Not used at runtime.
// Regenerate (only when bumping better-auth) with:
//   npx auth@1.7.23 generate --config scripts/auth-schema.config.ts --output src/db/auth-schema.ts -y
// then run `npm run db:generate` and review the migration by hand.
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "sqlite", transaction: false }),
  baseURL: "http://localhost:3000",
  secret: "generator-only-secret-generator-only-secret",
  emailAndPassword: { enabled: false },
  rateLimit: { enabled: true, storage: "database" },
  user: {
    additionalFields: {
      hostSubject: { type: "string", required: false, unique: true },
    },
  },
  plugins: [anonymous()],
});
