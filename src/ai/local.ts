import type { Category } from "../contracts/domain.ts";
import type { AiPostCluster, AiPostInput, AiProvider, CategorySuggestion } from "./types.ts";

export const ALL_CATEGORIES: readonly Category[] = ["feature", "bug", "general"];
export const MAX_CLUSTER_POSTS = 200;
export const CLUSTER_THRESHOLD = 0.5;

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

export function jaccard(a: Set<string>, b: Set<string>): number {
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
export function suggestCategoryLocal(
  input: { title: string; body?: string },
  allowedCategories: readonly Category[] = ALL_CATEGORIES,
): CategorySuggestion | null {
  const text = `${input.title} ${input.body ?? ""}`.trim();
  if (text.length < 4) return null;
  const [category, confidence]: [Category, number] = BUG.test(text)
    ? ["bug", 0.7]
    : FEATURE.test(text)
      ? ["feature", 0.7]
      : ["general", 0.4];
  return allowedCategories.includes(category) ? { category, confidence, source: "local" } : null;
}

export type CandidatePair = { a: AiPostInput; b: AiPostInput; score: number };

/** Title-token Jaccard pairs at or above `threshold`. Capped input keeps this bounded. */
export function findCandidatePairs(
  posts: readonly AiPostInput[],
  threshold = CLUSTER_THRESHOLD,
  maxPairs = 60,
): CandidatePair[] {
  const capped = posts.slice(0, MAX_CLUSTER_POSTS);
  const tokenSets = capped.map((post) => titleTokens(post.title));
  const pairs: CandidatePair[] = [];
  for (let i = 0; i < capped.length; i++) {
    const left = tokenSets[i]!;
    if (!left.size) continue;
    for (let j = i + 1; j < capped.length; j++) {
      const right = tokenSets[j]!;
      // Jaccard can never beat min/max of the set sizes, so skip hopeless pairs cheaply.
      if (Math.min(left.size, right.size) < threshold * Math.max(left.size, right.size)) continue;
      const score = jaccard(left, right);
      if (score >= threshold) pairs.push({ a: capped[i]!, b: capped[j]!, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, maxPairs);
}

export function clustersFromPairs(
  posts: readonly AiPostInput[],
  pairs: readonly CandidatePair[],
  maxGroups = 20,
): AiPostCluster[] {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const pair of pairs) {
    if (!parent.has(pair.a.id)) parent.set(pair.a.id, pair.a.id);
    if (!parent.has(pair.b.id)) parent.set(pair.b.id, pair.b.id);
    const rootA = find(pair.a.id);
    const rootB = find(pair.b.id);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }
  const components = new Map<string, AiPostInput[]>();
  for (const id of parent.keys()) {
    const post = byId.get(id);
    if (!post) continue;
    const root = find(id);
    const list = components.get(root);
    if (list) list.push(post);
    else components.set(root, [post]);
  }
  const groups: AiPostCluster[] = [];
  for (const members of components.values()) {
    if (members.length < 2) continue;
    const target = [...members].sort(
      (a, b) =>
        (b.votes ?? 0) - (a.votes ?? 0) ||
        (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
        a.id.localeCompare(b.id),
    )[0]!;
    const memberSet = new Set(members.map((member) => member.id));
    const score = pairs
      .filter((pair) => memberSet.has(pair.a.id) && memberSet.has(pair.b.id))
      .reduce((max, pair) => Math.max(max, pair.score), 0);
    groups.push({
      targetId: target.id,
      memberIds: members.filter((member) => member.id !== target.id).map((member) => member.id),
      score: Number(score.toFixed(3)),
    });
  }
  return groups.sort((a, b) => b.score - a.score).slice(0, maxGroups);
}

/** Local title-overlap clustering (Jaccard >= 0.5), at most 200 posts and 20 groups. */
export function clusterLocal(posts: readonly AiPostInput[]): AiPostCluster[] {
  return clustersFromPairs(posts, findCandidatePairs(posts));
}

export const localProvider: AiProvider = {
  name: "local",
  async suggestCategory(input, allowedCategories) {
    return suggestCategoryLocal(input, allowedCategories);
  },
  async clusterPosts(posts) {
    return clusterLocal(posts);
  },
};
