import { and, eq, lte, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { changelogEntries, changelogPosts, posts } from "../db/schema.ts";
import { githubReleases, type GitHubRelease } from "../integrations/github-releases.ts";
import { CHANGELOG_LIMITS } from "../contracts/changelog.ts";
import { runChangelogPublished } from "../server/changelog-events.ts";
import { readSettings } from "../server/settings.ts";
import { publiclyVisible } from "../server/visibility.ts";
import { emitStatusChanges } from "../server/webhooks.ts";
import { queueEmails, statusEmails } from "../email/events.ts";
import { config, db, env, portalUrl, providerRequest, readState, writeState } from "./shared.ts";

export const RELEASE_INTERVAL_MS = 60 * 60 * 1000; // 12 five-minute ticks.
export type ReleaseState = {
  repo: string;
  nextAt: number;
  page: number;
  startedAt: number;
  seen: number[];
  pages: Record<string, { etag?: string; ids: number[]; next: boolean }>;
};

/** Local #N, owner/repo#N and full issue URLs; foreign repository references never link. */
export function releaseIssueNumbers(body: string, repo: string): number[] {
  const numbers = new Set<number>();
  const pattern =
    /https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\b|(?<![\w/])(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/g;
  for (const match of body.matchAll(pattern)) {
    if ((match[1] ?? match[3] ?? repo).toLowerCase() !== repo.toLowerCase()) continue;
    const n = Number(match[2] ?? match[4]);
    if (Number.isSafeInteger(n) && n > 0) numbers.add(n);
  }
  return [...numbers];
}

async function activeRepo() {
  if (
    !config.integrations.github ||
    !env.GITHUB_TOKEN?.trim() ||
    (await readSettings()).changelog.source !== "github"
  )
    return null;
  return config.integrations.github.repo.toLowerCase();
}

async function hideRelease(repo: string, releaseId: number) {
  // Keep a tombstone so deletion/unpublish followed by republication cannot notify twice.
  await db()
    .update(changelogEntries)
    .set({ status: "draft", updatedAt: Date.now() })
    .where(
      and(
        eq(changelogEntries.githubRepo, repo),
        eq(changelogEntries.githubReleaseId, releaseId),
        ne(changelogEntries.status, "draft"),
      ),
    );
}

export async function storeRelease(repo: string, release: GitHubRelease): Promise<void> {
  if (release.draft || release.prerelease || !release.published_at) {
    await hideRelease(repo, release.id);
    return;
  }
  const database = db();
  const now = Date.now();
  const title = (release.name?.trim() || release.tag_name).slice(0, CHANGELOG_LIMITS.title);
  // Retain Markdown, never GitHub's HTML. Every portal/RSS/email renderer uses markdown.ts.
  const body = (release.body ?? "").slice(0, CHANGELOG_LIMITS.body);
  const publishedAt = Date.parse(release.published_at);
  const githubUrl = `https://github.com/${repo}/releases/tag/${encodeURIComponent(release.tag_name)}`;
  const existing = await database
    .select()
    .from(changelogEntries)
    .where(
      and(eq(changelogEntries.githubRepo, repo), eq(changelogEntries.githubReleaseId, release.id)),
    )
    .get();
  if (
    existing &&
    existing.title === title &&
    existing.body === body &&
    existing.publishedAt === publishedAt &&
    existing.githubUrl === githubUrl &&
    existing.status === "published" &&
    existing.githubNotifiedAt !== null
  )
    return;
  const id = existing?.id ?? crypto.randomUUID();
  const numbers = releaseIssueNumbers(body, repo);
  const linked = numbers.length
    ? await database
        .select()
        .from(posts)
        .where(
          sql`${posts.githubNumber} IN (SELECT value FROM json_each(${JSON.stringify(numbers)})) AND lower(${posts.githubUrl}) = ${`https://github.com/${repo}/issues/`} || ${posts.githubNumber}`,
        )
    : [];
  const moved = linked.filter((post) => post.status !== "done");
  const statements: BatchItem<"sqlite">[] = [
    database
      .insert(changelogEntries)
      .values({
        id,
        title,
        body,
        status: "published",
        publishedAt,
        githubRepo: repo,
        githubReleaseId: release.id,
        githubUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [changelogEntries.githubRepo, changelogEntries.githubReleaseId],
        set: { title, body, status: "published", publishedAt, githubUrl, updatedAt: now },
      }),
  ];
  // Resolve the persisted id in SQL: concurrent duplicate messages may have minted different ids.
  const entryId = sql`(SELECT id FROM changelog_entries WHERE github_repo = ${repo} AND github_release_id = ${release.id})`;
  statements.push(
    database.delete(changelogPosts).where(sql`${changelogPosts.entryId} = ${entryId}`),
  );
  const linkedIds = JSON.stringify(linked.map((post) => post.id));
  const movedIds = JSON.stringify(moved.map((post) => post.id));
  if (linked.length)
    statements.push(
      database
        .insert(changelogPosts)
        .select(sql`SELECT ${entryId}, value FROM json_each(${linkedIds})`),
    );
  if (moved.length)
    statements.push(
      database
        .update(posts)
        .set({ status: "done", updatedAt: now, revision: sql`${posts.revision} + 1` })
        .where(
          and(
            sql`${posts.id} IN (SELECT value FROM json_each(${movedIds}))`,
            ne(posts.status, "done"),
          ),
        ),
    );
  await database.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  // Atomic claim, shared by webhooks/backfill/retries; edits and republication never re-emit.
  const claimed = await database
    .update(changelogEntries)
    .set({ githubNotifiedAt: now })
    .where(
      sql`${changelogEntries.id} = ${entryId} AND ${changelogEntries.githubNotifiedAt} IS NULL`,
    )
    .returning({ id: changelogEntries.id });
  if (claimed.length) {
    const publicIds = linked.length
      ? await database
          .select({ id: posts.id })
          .from(posts)
          .where(
            and(sql`${posts.id} IN (SELECT value FROM json_each(${linkedIds}))`, publiclyVisible),
          )
      : [];
    await runChangelogPublished({
      entry: {
        id: claimed[0]!.id,
        title,
        body,
        publishedAt: new Date(publishedAt).toISOString(),
        postIds: publicIds.map((post) => post.id),
      },
      url: `${portalUrl()}/changelog/${claimed[0]!.id}`,
    });
  }
  // Keep each status fan-out below D1's parameter and Queue batch limits.
  for (let offset = 0; offset < moved.length; offset += 50) {
    const changes = moved.slice(offset, offset + 50);
    await queueEmails(
      statusEmails(
        changes.map((post) => ({
          post: { id: post.id, title: post.title, body: post.body },
          from: post.status,
          to: "done" as const,
        })),
      ),
    );
    await emitStatusChanges(changes.map((post) => ({ id: post.id, previous: post.status })));
  }
}

/** Fetch current state instead of trusting event ordering (e.g. an edited event after delete). */
export async function syncRelease(message: { repo: string; releaseId: number }) {
  const repo = await activeRepo();
  if (!repo || repo !== message.repo.toLowerCase()) return;
  const release = await githubReleases(providerRequest("github", "poll"), repo).get(
    message.releaseId,
  );
  if (release) await storeRelease(repo, release);
  else await hideRelease(repo, message.releaseId);
}

/** One conditional API request per hour, one page per turn, including large repositories. */
export async function reconcileReleases(now = Date.now()) {
  const repo = await activeRepo();
  if (!repo) return;
  const previous = await readState<ReleaseState>("github.releases");
  const state: ReleaseState =
    previous?.repo === repo
      ? previous
      : { repo, nextAt: 0, page: 1, startedAt: now, seen: [], pages: {} };
  if (state.nextAt > now) return;
  if (state.page === 1) state.startedAt = now;
  const cached = state.pages[state.page];
  const result = await githubReleases(providerRequest("github", "poll"), repo).list(
    state.page,
    cached?.etag,
  );
  if (!result.unchanged) {
    for (const release of result.releases) await storeRelease(repo, release);
    state.pages[state.page] = {
      etag: result.etag,
      ids: result.releases
        .filter((r) => !r.draft && !r.prerelease && r.published_at)
        .map((r) => r.id),
      next: result.next,
    };
  }
  const page = state.pages[state.page];
  if (!page) throw new Error("GitHub returned 304 without a cached page");
  state.seen = [...new Set([...state.seen, ...page.ids])];
  state.nextAt = now + RELEASE_INTERVAL_MS;
  if (page.next) state.page++;
  else {
    await db()
      .update(changelogEntries)
      .set({ status: "draft", updatedAt: now })
      .where(
        and(
          eq(changelogEntries.githubRepo, repo),
          eq(changelogEntries.status, "published"),
          lte(changelogEntries.updatedAt, state.startedAt),
          sql`${changelogEntries.githubReleaseId} NOT IN (SELECT value FROM json_each(${JSON.stringify(state.seen)}))`,
        ),
      );
    // Drop pages past the end after deletions shrink a repository.
    for (const key of Object.keys(state.pages))
      if (Number(key) > state.page) delete state.pages[key];
    state.page = 1;
    state.seen = [];
  }
  await writeState("github.releases", state);
}
