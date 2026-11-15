import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { NotionSetupClient } from "../src/contracts/integrations.ts";
import { pageProblem, tokenProblem } from "../packages/create-feedbax/src/flags.ts";
import { redact } from "../packages/create-feedbax/src/io.ts";
import { MANUAL_VIEW_STEPS, TEMPLATE_VIEWS } from "../src/integrations/notion-template.ts";

const USAGE =
  "Usage: NOTION_TOKEN=… npm run notion:template -- (--page <id-or-url> | --parent-page <id-or-url>) [--examples]\n" +
  "  --page         fill an EMPTY page you created and shared with the integration\n" +
  "  --parent-page  create a new Feedbax page inside this page\n" +
  "  --examples     add four example rows (no Feedbax ID, so sync ignores them)";

function parseFlags(argv: string[]) {
  try {
    const { values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        page: { type: "string" },
        "parent-page": { type: "string" },
        examples: { type: "boolean" },
      },
    });
    const target = values.page ?? values["parent-page"];
    if (!target || (values.page && values["parent-page"]) || pageProblem(target)) throw new Error();
    return { target, fill: values.page !== undefined, examples: values.examples === true };
  } catch {
    throw new Error(USAGE);
  }
}

export async function createNotionTemplate(
  argv: string[],
  env: Record<string, string | undefined>,
  injected?: NotionSetupClient,
): Promise<string> {
  const flags = parseFlags(argv);
  const token = env.NOTION_TOKEN;
  if (!token || tokenProblem(token))
    throw new Error(
      "Set NOTION_TOKEN to the connection's complete API token. Connect the page in the connection's Access (or Content access) tab → Edit access.",
    );
  // src/integrations owns the one schema, the template's blocks and its views. No local copy.
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
    const created = await client.createTemplatePage(flags.target, {
      fillPage: flags.fill,
      examples: flags.examples,
    });
    const rows = flags.examples ? ", plus 4 example rows" : "";
    const views = created.views?.created;
    console.log(
      [
        `Feedbax template: ${created.pageUrl}`,
        views
          ? `Created through the API: the guide, the Feedbax database and its ${TEMPLATE_VIEWS.length} views${rows}.`
          : `Created through the API: the guide and the Feedbax database${rows}.`,
        "Then, in Notion:\nBoard: drag the columns into Open, Planned, In progress, Done, Closed. The API cannot set their order.\n1. Share → Publish → Publish to web.\n2. Turn on Allow duplicate as template.\n3. Copy the public URL into NOTION_TEMPLATE_URL in packages/create-feedbax/src/links.ts.\n4. Use the same URL in README.md before releasing.\n(Optional: ••• → Full width on the page. The API cannot set it.)",
        ...(views
          ? []
          : [
              `Views need the browser${created.views?.error ? ` (${created.views.error})` : ""}.\n${MANUAL_VIEW_STEPS}`,
            ]),
      ].join("\n\n"),
    );
    return created.pageUrl;
  } catch (error) {
    throw new Error(
      redact(
        `${error instanceof Error ? error.message : "Notion template creation failed."}\nRetry: npm run notion:template -- ${flags.fill ? "--page" : "--parent-page"} ${safeTarget(flags.target)}${flags.examples ? " --examples" : ""}`,
        [token],
      ),
    );
  }
}
function safeTarget(value: string): string {
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
