import type { Category } from "../contracts/domain.ts";

const MAX_CLUSTER_POSTS = 200;
const CLUSTER_THRESHOLD = 0.5;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "can",
  "could",
  "do",
  "does",
  "for",
  "from",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "please",
  "should",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

/** Normalized title tokens for Jaccard overlap: lowercase words, stopwords dropped. */
export function titleTokens(text: string): Set<string> {
  const raw = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = raw.filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  return new Set(kept.length ? kept : raw.filter((token) => token.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const BUG =
  /\b(?:crash(?:es|ed|ing)?|error|bug|broken|fails?|failed|failing|doesn'?t work|does not work|not working|freeze|frozen|hangs?|stuck|exception|regression|glitch|timeout|unresponsive|blank page|incorrect|unexpected)\b/i;
const FEATURE =
  /\b(?:feature request|please add|add support|support for|ability to|allow|option to|enhancement|new feature|integrat(?:e|ion)|would be nice|would love|request|implement|enable|customi[sz]e|improve|suggest(?:ion)?|add)\b/i;

/**
 * Keyword heuristic: bug words win, then feature words, otherwise general. Null when the text
 * is too short or the winning category is not offered on this portal.
 */
export function suggestCategory(
  title: string,
  allowed: readonly Category[] = ["feature", "bug", "general"],
): Category | null {
  if (title.trim().length < 4) return null;
  const category: Category = BUG.test(title) ? "bug" : FEATURE.test(title) ? "feature" : "general";
  return allowed.includes(category) ? category : null;
}

export type ClusterInput = { id: string; title: string; votes: number; createdAt: number };
export type Cluster = { targetId: string; memberIds: string[]; score: number };

/**
 * Title-overlap clustering (Jaccard >= 0.5): at most 200 posts in, 20 groups out. Each group
 * keeps the post with the most votes, then the earliest, and lists the rest as duplicates.
 */
export function clusterPosts(posts: readonly ClusterInput[], maxGroups = 20): Cluster[] {
  const capped = posts.slice(0, MAX_CLUSTER_POSTS);
  const tokens = capped.map((post) => titleTokens(post.title));
  const parent = capped.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) index = parent[index]!;
    return index;
  };
  const best = new Map<number, number>();
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < capped.length; i++) {
    const left = tokens[i]!;
    if (!left.size) continue;
    for (let j = i + 1; j < capped.length; j++) {
      const right = tokens[j]!;
      // Jaccard can never beat min/max of the set sizes, so skip hopeless pairs cheaply.
      if (Math.min(left.size, right.size) < CLUSTER_THRESHOLD * Math.max(left.size, right.size))
        continue;
      const score = jaccard(left, right);
      if (score >= CLUSTER_THRESHOLD) pairs.push([i, j, score]);
    }
  }
  for (const [i, j] of pairs) parent[find(j)] = find(i);
  for (const [i, , score] of pairs) {
    const root = find(i);
    best.set(root, Math.max(best.get(root) ?? 0, score));
  }
  const members = new Map<number, ClusterInput[]>();
  for (const [i] of pairs) members.set(find(i), []);
  for (const root of members.keys())
    for (let i = 0; i < capped.length; i++)
      if (find(i) === root) members.get(root)!.push(capped[i]!);
  return [...members.entries()]
    .map(([root, list]) => {
      const [target] = [...list].sort(
        (a, b) => b.votes - a.votes || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      );
      return {
        targetId: target!.id,
        memberIds: list.filter((post) => post.id !== target!.id).map((post) => post.id),
        score: Number(best.get(root)!.toFixed(3)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxGroups);
}
