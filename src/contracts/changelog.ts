import type { Page, Status } from "./domain.ts";

// Shapes shared by the changelog server functions, the public /changelog pages, the RSS feed
// and /admin/changelog. Types and limits only.

export const CHANGELOG_LIMITS = {
  title: 200,
  body: 20_000,
  pageSize: 10,
  linkedPosts: 20,
} as const;

/** A post an entry links to. Public reads only ever list publicly visible posts. */
export type ChangelogPostLink = { id: string; title: string; status: Status };
export type ChangelogEntryStatus = "draft" | "published";

/** What visitors see: published entries only. `publishedAt` is an ISO time. */
export type ChangelogEntry = {
  id: string;
  title: string;
  /** Markdown. Always render it through the safe renderer (src/lib/markdown.ts). */
  body: string;
  publishedAt: string;
  posts: ChangelogPostLink[];
};
export type ChangelogPage = Page<ChangelogEntry>;

/** "Shipped in …" on a post page: a published entry that links the post. */
export type ShippedIn = { id: string; title: string };

/** What admins see: drafts too, and linked posts even when they are hidden. */
export type AdminChangelogPost = ChangelogPostLink & { visible: boolean };
export type AdminChangelogEntry = {
  id: string;
  title: string;
  body: string;
  status: ChangelogEntryStatus;
  githubUrl?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  posts: AdminChangelogPost[];
};
export type AdminChangelogPage = Page<AdminChangelogEntry>;
/** A publicly visible post offered by the post picker. */
export type ChangelogPostCandidate = ChangelogPostLink & { votes: number; createdAt: string };

/** Fired once each time an entry goes from draft to published (see changelog-events.ts). */
export type ChangelogPublishedEvent = {
  entry: { id: string; title: string; body: string; publishedAt: string; postIds: string[] };
  /** Absolute URL of the entry on the portal. */
  url: string;
};
