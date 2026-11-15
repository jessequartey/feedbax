import { env } from "cloudflare:workers";
import type { SimilarGroupsResult, SimilarPostGroup } from "../contracts/similar.ts";
import type { Status } from "../contracts/domain.ts";
import { clusterPosts } from "./similar-text.ts";

const SCAN_LIMIT = 200;

type ClusterRow = { id: string; title: string; status: Status; votes: number; created_at: number };

/**
 * Admin similar groups: one posts read (200 newest open public posts), then local title
 * clustering. No settings read, no external IO, no cron or queue work.
 */
export async function listSimilarGroups(d1: D1Database = env.DB): Promise<SimilarGroupsResult> {
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
    .bind(SCAN_LIMIT)
    .all<ClusterRow>();
  const byId = new Map(results.map((row) => [row.id, row]));
  const toPost = (row: ClusterRow) => ({
    id: row.id,
    title: row.title,
    votes: Number(row.votes ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
  });
  const groups: SimilarPostGroup[] = clusterPosts(
    results.map((row) => ({
      id: row.id,
      title: row.title,
      votes: Number(row.votes ?? 0),
      createdAt: row.created_at,
    })),
  ).map((cluster) => ({
    target: toPost(byId.get(cluster.targetId)!),
    duplicates: cluster.memberIds.map((id) => toPost(byId.get(id)!)),
    score: cluster.score,
  }));
  return { scanned: results.length, groups };
}
