import { richText } from "./notion-schema.ts";

/** Everything the official Feedbax Notion template contains, kept as data so the layout is testable. */
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
          bullet("Posts arrive automatically from your portal."),
          bullet("Change **Status** to move posts across your public roadmap."),
          bullet("Tick **Send to GitHub** to open an issue. Closing it marks the post Done."),
          bullet("Keep the built-in properties' names. Add your own freely."),
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
          step("Run `npx create-feedbax@latest`."),
          step("Open your portal and post the first feedback."),
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
  daysAgo: number;
  description: string;
};
export const EXAMPLE_ROWS: ExampleRow[] = [
  {
    name: "Example: Dark mode",
    category: "Feature request",
    status: "Planned",
    votes: 12,
    daysAgo: 4,
    description: "A dark theme for the portal, so late-night browsing is easier on the eyes.",
  },
  {
    name: "Example: Crash on sign in",
    category: "Bug report",
    status: "Open",
    votes: 8,
    daysAgo: 3,
    description: "The app closes right after I enter my password on the sign-in screen.",
  },
  {
    name: "Example: Team invites",
    category: "Feature request",
    status: "In progress",
    votes: 19,
    daysAgo: 2,
    description: "Let me invite my whole team by email instead of one at a time.",
  },
  {
    name: "Example: Roadmap labels",
    category: "General feedback",
    status: "Done",
    votes: 5,
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
  position?: "start" | "after-board";
};
const select = (property: string, value: string) => ({ property, select: { equals: value } });
const created = [{ property: "Created", direction: "descending" }];

/** In tab order. "🗂 All feedback" reuses the table view Notion creates with the database. */
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
        properties: visible(ids, ["Category", "Votes"]),
      },
    }),
  },
  {
    name: "📥 Inbox",
    position: "after-board",
    body: (ids) => ({
      type: "list",
      filter: select("Status", "Open"),
      sorts: created,
      configuration: { type: "list", properties: visible(ids, ["Category", "Votes", "Created"]) },
    }),
  },
  { name: "🗂 All feedback", body: null },
  {
    name: "📅 Calendar",
    body: (ids) => ({
      type: "calendar",
      configuration: {
        type: "calendar",
        date_property_id: ids.Created,
        view_range: "month",
        properties: visible(ids, ["Status"]),
      },
    }),
  },
  {
    name: "🐞 Bugs",
    body: (ids) => ({
      type: "list",
      filter: select("Category", "Bug report"),
      configuration: { type: "list", properties: visible(ids, ["Status", "Votes", "Created"]) },
    }),
  },
  {
    name: "💡 Ideas",
    body: (ids) => ({
      type: "list",
      filter: select("Category", "Feature request"),
      configuration: { type: "list", properties: visible(ids, ["Status", "Votes", "Created"]) },
    }),
  },
  {
    name: "🐙 GitHub queue",
    body: (ids) => ({
      type: "table",
      filter: { property: "Send to GitHub", checkbox: { equals: true } },
      configuration: {
        type: "table",
        properties: visible(ids, ["Status", "Category", "Votes", "GitHub", "Created"]),
      },
    }),
  },
];

/** Printed when the Views API step is unavailable or fails. */
export const MANUAL_VIEW_STEPS = [
  "Create these views in Notion (open the Feedbax database, then + Add a view next to the tabs).",
  'Rename the default table view to "🗂 All feedback" and drag the tabs into this order:',
  "1. 📋 Board: layout Board, Group by Status. Make it the first tab.",
  "Board: drag the columns into Open, Planned, In progress, Done, Closed.",
  "2. 📥 Inbox: layout List. Filter: Status is Open. Sort: Created, descending.",
  "3. 🗂 All feedback: layout Table (the default view, just renamed).",
  "4. 📅 Calendar: layout Calendar, Show calendar by Created.",
  "5. 🐞 Bugs: layout List. Filter: Category is Bug report.",
  "6. 💡 Ideas: layout List. Filter: Category is Feature request.",
  "7. 🐙 GitHub queue: layout Table. Filter: Send to GitHub is checked.",
  "In each view, use ••• → Properties to hide Feedbax ID and any column you do not need.",
].join("\n");
