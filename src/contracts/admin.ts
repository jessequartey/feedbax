import type { Category, Page, PublicAuthor, Status } from "./domain.ts";

// Shapes shared by the admin server functions and the /admin pages. Types only.

export type NotificationToggles = {
  statusChanges: boolean;
  replies: boolean;
  changelog: boolean;
  adminDigest: boolean;
};
export type ChangelogSettings = {
  /** Draft a changelog entry when a post becomes Done. */
  autoDraft: boolean;
};
export type RuntimeSettings = {
  name: string;
  anonymous: boolean;
  /** Categories offered on the portal, in display order. */
  categories: Category[];
  /** Site-wide email switches; per-user choices live in `email_prefs`. */
  notifications: NotificationToggles;
  changelog: ChangelogSettings;
};
/** What /admin/settings edits: the effective values, and what feedbax.config.ts would give. */
export type AdminSettings = { effective: RuntimeSettings; defaults: RuntimeSettings };

export type ModerationFilter = "all" | "hidden" | "spam";
export type PostState = "visible" | "hidden" | "spam";
export type ModerationPost = {
  id: string;
  title: string;
  excerpt: string;
  category: Category;
  status: Status;
  author: PublicAuthor;
  votes: number;
  comments: number;
  createdAt: string;
  state: PostState;
  /** The post this duplicate was merged into, if any. */
  mergedInto: string | null;
  githubUrl: string | null;
  /** True once an issue was requested (Notion checkbox or the admin button). */
  githubRequested: boolean;
};
export type ModerationPostPage = Page<ModerationPost> & {
  /** Send to GitHub is offered only when GitHub sync is configured. */
  githubEnabled: boolean;
};
export type ModerationComment = {
  id: string;
  postId: string;
  postTitle: string;
  body: string;
  author: PublicAuthor;
  createdAt: string;
};
export type MergeCandidate = { id: string; title: string; votes: number; createdAt: string };
export type DeletePostResult = {
  /** "queued": the Notion row will be archived; "none": it was never mirrored; "failed": queue was down. */
  notion: "queued" | "none" | "failed";
};

export type UserFilter = "all" | "admin" | "banned";
export type AdminUser = {
  id: string;
  name: string;
  /** Null for anonymous, host and built-in admin users, which have no real address. */
  email: string | null;
  kind: "account" | "host" | "anonymous";
  admin: boolean;
  banned: boolean;
  /** The shared admin behind `npx feedbax admin`. It cannot be banned. */
  builtIn: boolean;
  /** The signed-in admin looking at the list. They cannot revoke or ban themselves. */
  self: boolean;
  createdAt: string;
};
