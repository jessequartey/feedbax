export type ChangelogBodyBlock =
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "bullets"; readonly items: readonly string[] };

export type ChangelogImage = {
  readonly src: string;
  readonly alt: string;
};

export type ChangelogDate = `${number}-${number}-${number}`;

export type ChangelogLabel = string;

export type ChangelogEntry = {
  readonly slug: string;
  readonly date: ChangelogDate;
  readonly title: string;
  readonly summary: string;
  readonly body: readonly ChangelogBodyBlock[];
  readonly labels: readonly ChangelogLabel[];
  readonly image?: ChangelogImage;
};

export const changelogEntries: readonly ChangelogEntry[] = [
  {
    slug: "keyboard-first-search",
    date: "2026-08-22",
    title: "Keyboard-first search",
    summary:
      "Open search with Command K and move through results without the mouse.",
    body: [
      {
        type: "bullets",
        items: ["Search Posts from any page", "Use arrow keys and Enter"],
      },
    ],
    labels: ["New feature"],
    image: {
      src: "/changelog/keyboard-first-search.svg",
      alt: "Keyboard-first search palette showing top Post results",
    },
  },
  {
    slug: "clearer-roadmap-filters",
    date: "2026-08-12",
    title: "Clearer roadmap filters",
    summary: "Find work by status and type with fewer clicks.",
    body: [
      {
        type: "paragraph",
        text: "Status groups and Post Type labels now keep every roadmap column easier to scan.",
      },
    ],
    labels: ["Improved"],
  },
  {
    slug: "reliable-draft-recovery",
    date: "2026-07-30",
    title: "More reliable draft recovery",
    summary: "Browser-held drafts now restore consistently after refresh.",
    body: [
      {
        type: "paragraph",
        text: "Draft access remains on this device, with recovery state restored before editing resumes.",
      },
    ],
    labels: ["Fixed"],
  },
  {
    slug: "csv-export",
    date: "2026-07-18",
    title: "CSV export",
    summary: "Download published feedback for analysis.",
    body: [
      {
        type: "paragraph",
        text: "Exported rows include the public Post fields teams need for lightweight reporting.",
      },
    ],
    labels: ["New feature"],
  },
  {
    slug: "roadmap-progress-at-a-glance",
    date: "2026-06-29",
    title: "Roadmap progress at a glance",
    summary: "See planned, in-progress, and shipped work in focused columns.",
    body: [
      {
        type: "paragraph",
        text: "Updated counts and clearer status treatment make product progress easier to follow.",
      },
    ],
    labels: ["Improved"],
  },
  {
    slug: "sharper-search-results",
    date: "2026-06-11",
    title: "Sharper search results",
    summary: "Search now keeps the most relevant public Posts at the top.",
    body: [
      {
        type: "paragraph",
        text: "Matching titles and descriptions are ranked consistently across the public portal.",
      },
    ],
    labels: ["Fixed"],
  },
] as const;
