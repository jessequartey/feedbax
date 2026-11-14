import type { Clients } from "./types.ts";
export async function loadClients(): Promise<Clients> {
  // cli-build bundles the real src/integrations factories into providers.mjs; tests inject Clients instead.
  const url = new URL("./providers.mjs", import.meta.url);
  const providers = (await import(url.href)) as {
    createNotionSetupClient: Clients["notion"];
    createGitHubSetupClient: Clients["github"];
  };
  return { notion: providers.createNotionSetupClient, github: providers.createGitHubSetupClient };
}
