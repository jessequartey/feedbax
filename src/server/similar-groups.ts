import { env } from "cloudflare:workers";
import { resolveAiProvider } from "../ai/index.ts";
import type { SimilarGroupsResult, SimilarPostGroup } from "../contracts/ai.ts";
import type { Status } from "../contracts/domain.ts";
import { readSettings } from "./settings.ts";

const CLUSTER_SCAN_LIMIT = 200;

type ClusterRow = { id: string; title: string; status: Status; votes: number; created_at: number };

/**
 * Admin similar groups: one settings read plus one posts read (200 newest open public
 * posts), then local Jaccard clustering. A configured external provider may re-rank
 * the candidate pairs; any failure falls back to local. No cron or queue work.
 */
export async function listSimilarGroups(
  d1: D1Database = env.DB,
  apiKey: string | undefined = env.AI_API_KEY,
): Promise<SimilarGroupsResult> {
  const settings = await readSettings(d1);
  if (settings.ai.provider === "off") return { provider: "off", scanned: 0, groups: [] };
  const { results } = await d1
    .prepare(
      `SELECT p.id, p.title, p.status, p.created_at,
              (SELECT count(*) FROM votes WHERE post_id = p.id) AS votes
       FROM posts p
       WHERE p.hidden_at IS NULL AND p.spam = 0 AND p.merged_into IS NULL
         AND p.status = 'open'
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
    )
    .bind(CLUSTER_SCAN_LIMIT)
    .all<ClusterRow>();
  if (results.length < 2)
    return { provider: settings.ai.provider, scanned: results.length, groups: [] };
  const provider = resolveAiProvider(settings.ai, apiKey);
  const clusters = await provider.clusterPosts(
    results.map((row) => ({
      id: row.id,
      title: row.title,
      body: "",
      votes: Number(row.votes ?? 0),
      createdAt: row.created_at,
    })),
  );
  const byId = new Map(results.map((row) => [row.id, row]));
  const toPost = (row: ClusterRow) => ({
    id: row.id,
    title: row.title,
    votes: Number(row.votes ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
  });
  const groups: SimilarPostGroup[] = [];
  for (const cluster of clusters) {
    const target = byId.get(cluster.targetId);
    if (!target) continue;
    const duplicates = cluster.memberIds
      .map((id) => byId.get(id))
      .filter((row): row is ClusterRow => !!row && row.id !== target.id)
      .map(toPost);
    if (duplicates.length)
      groups.push({ target: toPost(target), duplicates, score: cluster.score });
  }
  return { provider: provider.name, scanned: results.length, groups: groups.slice(0, 20) };
}
