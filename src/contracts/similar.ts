import type { Category, Status } from "./domain.ts";

export type SimilarPostHit = {
  id: string;
  title: string;
  status: Status;
  votes: number;
};

export type SuggestSimilarResult = {
  items: SimilarPostHit[];
  /** Keyword heuristic only; null when no category fits or it is not offered on this portal. */
  suggestedCategory: Category | null;
};

export type SimilarGroupPost = {
  id: string;
  title: string;
  votes: number;
  createdAt: string;
};

export type SimilarPostGroup = {
  /** The post to keep: highest votes, then earliest. */
  target: SimilarGroupPost;
  duplicates: SimilarGroupPost[];
  score: number;
};

export type SimilarGroupsResult = {
  scanned: number;
  groups: SimilarPostGroup[];
};
