import type { Clients } from "./types.ts";
export async function loadClients(): Promise<Clients> {
  // cli-build bundles W2's frozen factories separately so tests can inject Clients.
  // TEMP until W2 merges: cli-build emits an explicit unavailable-provider module.
  const url = new URL("./providers.mjs", import.meta.url);
  const providers = (await import(url.href)) as {
    createNotionSetupClient: Clients["notion"];
    createGitHubSetupClient: Clients["github"];
  };
  return { notion: providers.createNotionSetupClient, github: providers.createGitHubSetupClient };
}
