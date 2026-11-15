import { NOTION_SCHEMA, NOTION_PRIORITY, richText } from "./notion-schema.ts";

/** Everything the official Feedbax Notion template contains, kept as data so the layout is testable. */
export const TEMPLATE_SCHEMA = { ...NOTION_SCHEMA, Priority: NOTION_PRIORITY };
export const TEMPLATE_TITLE = "Feedbax";
export const TEMPLATE_ICON = { type: "emoji", emoji: "💬" } as const;
// Notion's own gradient gallery. Public, no auth, and verified to answer 200 image/png.
export const TEMPLATE_COVER = {
  type: "external",
  external: { url: "https://www.notion.so/images/page-cover/gradients_8.png" },
} as const;
export const FOOTER_URL = "https://github.com/jessequartey/feedbax";

type Run = {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: { bold?: boolean; code?: boolean; color?: string };
};

/** Tiny inline markup: **bold** and `code`. Anything else is literal text. */
export function inline(markup: string): Run[] {
  const runs: Run[] = [];
  for (const part of markup.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean)) {
    if (part.startsWith("**")) runs.push(run(part.slice(2, -2), { bold: true }));
    else if (part.startsWith("`")) runs.push(run(part.slice(1, -1), { code: true }));
    else runs.push(run(part));
  }
  return runs;
}
function run(content: string, annotations?: Run["annotations"], link?: string): Run {
  return {
    type: "text",
    text: { content, ...(link ? { link: { url: link } } : {}) },
    ...(annotations ? { annotations } : {}),
  };
}
const bullet = (markup: string) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: inline(markup) },
});
const step = (markup: string) => ({
  object: "block",
  type: "numbered_list_item",
  numbered_list_item: { rich_text: inline(markup) },
});

/** Blocks above the database, in page order. */
export function guideBlocks() {
  return [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: richText(
          "Your team's feedback dashboard. Posts arrive from your Feedbax portal.",
        ),
        color: "gray",
      },
    },
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [run("How this works", { bold: true })],
        icon: { type: "emoji", emoji: "💡" },
        color: "gray_background",
        children: [
          bullet(
            "Triage: set **Status** or drag cards on the board. The portal updates within about 5 minutes.",
          ),
          bullet(
            "Prioritize: set **Priority** (0–100). The **By priority** view sorts by it.",
          ),
          bullet(
            "Ship: tick **Send to GitHub** to open an issue. A GitHub release noting `Closes #N` marks linked posts Done and adds a changelog entry.",
          ),
          bullet(
            "Users can follow posts and get an email when the status changes (needs email set up).",
          ),
          bullet(
            "Moderate in the portal with `npx feedbax admin`: review profanity, merge duplicates, hide or mark spam.",
          ),
          bullet("Keep the 13 built-in properties' names. Add your own freely."),
        ],
      },
    },
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: richText("Getting started"),
        is_toggleable: true,
        color: "default",
        children: [
          step("Connect your Notion integration: ••• → Connections."),
          step("Run `npx create-feedbax@latest`. Anonymous feedback is on."),
          step("Open your portal and post the first feedback."),
          step(
            "Admin, changelog, email and webhooks are in the portal, not here. Run `npx feedbax admin`, then open `/admin/settings`. Add email with `npx feedbax add email`. Add webhooks with `npx feedbax add webhooks`.",
          ),
        ],
      },
    },
  ];
}

/** Blocks below the database. */
export function footerBlocks() {
  return [
    { object: "block", type: "divider", divider: {} },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          run("Powered by Feedbax · "),
          run("github.com/jessequartey/feedbax", undefined, FOOTER_URL),
        ],
        color: "gray",
      },
    },
  ];
}

export type ExampleRow = {
  name: string;
  category: string;
  status: string;
  votes: number;
  priority: number;
  daysAgo: number;
  description: string;
};
export const EXAMPLE_ROWS: ExampleRow[] = [
  {
    name: "Example: Dark mode",
    category: "Feature request",
    status: "Planned",
    votes: 12,
    priority: 80,
    daysAgo: 4,
    description: "A dark theme for the portal, so late-night browsing is easier on the eyes.",
  },
  {
    name: "Example: Crash on sign in",
    category: "Bug report",
    status: "Open",
    votes: 8,
    priority: 95,
    daysAgo: 3,
    description: "The app closes right after I enter my password on the sign-in screen.",
  },
  {
    name: "Example: Team invites",
    category: "Feature request",
    status: "In progress",
    votes: 19,
    priority: 60,
    daysAgo: 2,
    description: "Let me invite my whole team by email instead of one at a time.",
  },
  {
    name: "Example: Roadmap labels",
    category: "General feedback",
    status: "Done",
    votes: 5,
    priority: 20,
    daysAgo: 1,
    description: "Love the public roadmap. The status labels make it easy to follow.",
  },
];

/** YYYY-MM-DD for `now` minus `daysAgo` (UTC), never earlier than the 1st of now's month. */
export function exampleDate(now: Date, daysAgo: number): string {
  const day = Math.max(1, now.getUTCDate() - daysAgo);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day))
    .toISOString()
    .slice(0, 10);
}

/** Feedbax ID is deliberately omitted: sync ignores rows without one. */
export function exampleProperties(row: ExampleRow, now: Date) {
  return {
    Name: { title: richText(row.name) },
    Description: { rich_text: richText(row.description) },
    Category: { select: { name: row.category } },
    Status: { select: { name: row.status } },
    Votes: { number: row.votes },
    Priority: { number: row.priority },
    Created: { date: { start: exampleDate(now, row.daysAgo) } },
  };
}

type PropertyIds = Record<string, string>;
const TEMPLATE_PROPERTIES = [
  "Feedbax ID",
  "Description",
  "Category",
  "Status",
  "Send to GitHub",
  "Votes",
  "Priority",
  "Comments",
  "Author",
  "Portal",
  "GitHub",
  "Images",
  "Created",
];
/** Explicit visibility for every non-title property, so views never show the internal Feedbax ID. */
function visible(ids: PropertyIds, show: string[]) {
  return TEMPLATE_PROPERTIES.filter((name) => ids[name]).map((name) => ({
    property_id: ids[name]!,
    visible: show.includes(name),
  }));
}

export type ViewSpec = {
  name: string;
  /** Request body minus database_id, data_source_id and position. `null` means "rename the default view". */
  body: ((ids: PropertyIds) => Record<string, unknown>) | null;
  position?: "start";
};

/**
 * In tab order. "🗂 All feedback" reuses the table view Notion creates with the database.
 * Sync reads and writes one data source, not views, so the template keeps the board
 * (grouped by Status, including Done) and that table. Inbox, calendar, category lists
 * and a GitHub queue were filters over the same rows. The issue number lives in D1;
 * Notion stores the issue URL on GitHub.
 */
export const TEMPLATE_VIEWS: ViewSpec[] = [
  {
    name: "📋 Board",
    position: "start",
    body: (ids) => ({
      type: "board",
      configuration: {
        type: "board",
        group_by: {
          type: "select",
          property_id: ids.Status,
          sort: { type: "manual" },
          hide_empty_groups: false,
        },
        properties: visible(ids, ["Category", "Votes", "GitHub"]),
      },
    }),
  },
  { name: "🗂 All feedback", body: null },
  {
    name: "By priority",
    body: (ids) => ({
      type: "table",
      sorts: [{ property: "Priority", direction: "descending" }],
      configuration: { type: "table", properties: visible(ids, ["Status", "Priority", "Votes"]) },
    }),
  },
];

/** Printed when the Views API step is unavailable or fails. */
export const MANUAL_VIEW_STEPS = [
  "Create these views in Notion (open the Feedbax database, then + Add a view next to the tabs).",
  'Rename the default table view to "🗂 All feedback" and drag the tabs into this order:',
  "1. 📋 Board: layout Board, Group by Status. Make it the first tab.",
  "Board: drag the columns into Open, Planned, In progress, Done, Closed.",
  "2. 🗂 All feedback: layout Table (the default view, just renamed).",
  "3. By priority: layout Table, sort Priority descending.",
  "In each view, use ••• → Properties to hide Feedbax ID and any column you do not need.",
].join("\n");
