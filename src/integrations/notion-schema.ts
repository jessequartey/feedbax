import { CATEGORY_LABELS, STATUS_LABELS } from "../contracts/domain.ts";
import { IntegrationError } from "../contracts/integrations.ts";

export const NOTION_VERSION = "2026-03-11";
export const GITHUB_API_VERSION = "2026-03-10";

export type NotionProperty = {
  id?: string;
  type?: string;
  title?: unknown;
  rich_text?: unknown;
  select?: { options?: { name: string; id?: string; color?: string }[] };
  [key: string]: unknown;
};
export type NotionProperties = Record<string, NotionProperty>;

/** Option colours. Cosmetic only: validation and setup match options by name, never by colour. */
const CATEGORY_COLORS = {
  "Feature request": "purple",
  "Bug report": "red",
  "General feedback": "gray",
} as const;
const STATUS_COLORS = {
  Open: "gray",
  Planned: "blue",
  "In progress": "yellow",
  Done: "green",
  Closed: "red",
} as const;
// Option order is the Notion board's column order, so it follows the label tables' order.
const colored = (labels: Record<string, string>, colors: Record<string, string>) =>
  Object.values(labels).map((name) => ({ name, color: colors[name] ?? "default" }));

export const NOTION_SCHEMA = {
  Name: { title: {} },
  "Feedbax ID": { rich_text: {} },
  Description: { rich_text: {} },
  Category: { select: { options: colored(CATEGORY_LABELS, CATEGORY_COLORS) } },
  Status: { select: { options: colored(STATUS_LABELS, STATUS_COLORS) } },
  "Send to GitHub": { checkbox: {} },
  Votes: { number: { format: "number" } },
  Comments: { number: { format: "number" } },
  Author: { rich_text: {} },
  Portal: { url: {} },
  GitHub: { url: {} },
  Images: { files: {} },
  Created: { date: {} },
} satisfies NotionProperties;

export function schemaError(message: string): IntegrationError {
  return new IntegrationError("notion", "schema", null, null, message);
}

/** Validate by name. Setup can add missing properties/options; runtime never repairs schema. */
export function notionSchemaChanges(
  properties: NotionProperties,
  allowMissing = false,
): NotionProperties {
  const changes: NotionProperties = {};
  for (const [name, expected] of Object.entries(NOTION_SCHEMA)) {
    const type = Object.keys(expected)[0];
    const actual = properties[name];
    if (!actual) {
      if (!allowMissing) throw schemaError(`Notion is missing the required ${name} property.`);
      changes[name] = expected;
      continue;
    }
    if ((actual.type ?? Object.keys(actual)[0]) !== type) {
      throw schemaError(`Notion property ${name} must have type ${type}.`);
    }
    if (type === "select") {
      const options = actual.select?.options ?? [];
      const required = (expected as NotionProperty).select?.options ?? [];
      const missing = required.filter((option) => !options.some((o) => o.name === option.name));
      if (missing.length) {
        if (!allowMissing)
          throw schemaError(`Notion property ${name} is missing required select options.`);
        changes[name] = { select: { options: [...options, ...missing] } };
      }
    }
  }
  return changes;
}

export function richText(content: string): { type: "text"; text: { content: string } }[] {
  const runs: { type: "text"; text: { content: string } }[] = [];
  // Keep surrogate pairs together, while respecting Notion's 2000 UTF-16-unit limit.
  let run = "";
  for (const character of content) {
    if (run.length + character.length > 2000) {
      runs.push({ type: "text", text: { content: run } });
      run = "";
    }
    run += character;
  }
  if (run) runs.push({ type: "text", text: { content: run } });
  return runs;
}
