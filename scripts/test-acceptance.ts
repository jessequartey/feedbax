// Explicit opt-in: this command creates dedicated resources and deploys a portal.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { main } from "../packages/create-feedbax/src/index.ts";
import { loadClients } from "../packages/create-feedbax/src/providers.ts";
if (process.env.FEEDBAX_ACCEPTANCE !== "1") {
  console.log(
    "Real-resource acceptance is opt-in. Set FEEDBAX_ACCEPTANCE=1 and NOTION_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (plus GITHUB_TOKEN for notion-github).\nRun: npm run test:acceptance -- <dedicated-project> --template notion --notion-page <shared-page-id>\nThis creates resources and deploys; it never deletes them. Then verify post + image → Notion, Notion Status → portal, and for GitHub tick Send to GitHub → exactly one issue → close → Done.",
  );
} else {
  // Use the packed factories; never import an alternate provider implementation.
  const providerModule = await import(
    pathToFileURL(resolve("packages/create-feedbax/dist/providers.mjs")).href
  );
  const clients: Awaited<ReturnType<typeof loadClients>> = {
    notion: providerModule.createNotionSetupClient,
    github: providerModule.createGitHubSetupClient,
  };
  process.exitCode = await main([...process.argv.slice(2), "--yes"], {
    clients,
    templateDir: resolve("packages/create-feedbax/template"),
  });
}
