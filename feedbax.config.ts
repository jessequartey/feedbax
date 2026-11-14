import { defineConfig } from "./src/contracts/config.ts";

export default defineConfig({
  name: "Feedbax", // 1–60 chars, shown in the header
  // appUrl: "https://app.example.com", // your SaaS URL: "Back to app" + the only CORS origin for the block
  auth: { anonymous: false }, // true = people can post/comment/vote without an account
  integrations: {
    notion: { dataSourceId: "00000000-0000-0000-0000-000000000000" }, // filled by the CLI (a data source ID, not a database ID)
    github: false, // or { repo: 'owner/repo' }
  },
});
