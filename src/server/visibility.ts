import { and, eq, isNull } from "drizzle-orm";
import { posts } from "../db/schema.ts";

// Moderation never deletes on hide, spam or merge; it only takes a post out of public view.
// Every public read and every write that targets a post goes through this one predicate, so
// a new query cannot forget a rule. Raw SQL that reads `posts` for the public must repeat it
// (grep `publiclyVisible`).

/** A post anyone may see: not hidden, not spam, not merged into another post. */
export const publiclyVisible = and(
  isNull(posts.hiddenAt),
  eq(posts.spam, 0),
  isNull(posts.mergedInto),
);

/** How far a merge chain is followed before giving up. Merges repoint chains, so it is short. */
export const MAX_MERGE_DEPTH = 10;
