import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NotionSetupClient } from "../src/contracts/integrations.ts";
import { pageProblem, tokenProblem } from "../packages/create-feedbax/src/flags.ts";
import { redact } from "../packages/create-feedbax/src/io.ts";
export async function createNotionTemplate(
  argv: string[],
  env: Record<string, string | undefined>,
  injected?: NotionSetupClient,
): Promise<string> {
  if (argv.length !== 2 || argv[0] !== "--parent-page" || pageProblem(argv[1]!))
    throw new Error("Usage: NOTION_TOKEN=… npm run notion:template -- --parent-page <id-or-url>");
  const token = env.NOTION_TOKEN;
  if (!token || tokenProblem(token))
    throw new Error(
      "Set NOTION_TOKEN to the integration's complete Internal Integration Secret. Share the parent page in Content access → Edit access.",
    );
  // W2 owns the one schema and the template's guide blocks. No local schema copy.
  const moduleUrl = new URL("../src/integrations/notion.ts", import.meta.url);
  try {
    const client =
      injected ??
      (
        (await import(moduleUrl.href)) as {
          createNotionSetupClient: (token: string) => NotionSetupClient;
        }
      ).createNotionSetupClient(token);
    await client.me();
    const parent = await client.getPage(argv[1]!);
    const created = await client.createTemplatePage(parent.id);
    console.log(
      `Feedbax template: ${created.pageUrl}\n\nOpen that page in Notion:\n1. Share → Publish → Publish to web.\n2. Turn on Allow duplicate as template.\n3. Copy the public URL into NOTION_TEMPLATE_URL in packages/create-feedbax/src/links.ts.\n4. Use the same URL in README.md before releasing.\n\nThe dashboard guide explains statuses, Send to GitHub, and public images. No sample rows are created.`,
    );
    return created.pageUrl;
  } catch (error) {
    throw new Error(
      redact(
        `${error instanceof Error ? error.message : "Notion template creation failed."}\nRetry: npm run notion:template -- --parent-page ${parentId(argv[1]!)}`,
        [token],
      ),
    );
  }
}
function parentId(value: string): string {
  return value.replace(/[^\w:/?.=-]/g, "");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await createNotionTemplate(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(
      redact(error instanceof Error ? error.message : "Template creation failed.", [
        process.env.NOTION_TOKEN ?? "",
      ]),
    );
    process.exitCode = 1;
  }
}
