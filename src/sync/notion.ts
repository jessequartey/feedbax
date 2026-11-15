import { IntegrationError } from "../contracts/integrations.ts";
import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray, sql } from "drizzle-orm";
import { CATEGORY_LABELS, STATUS_LABELS } from "../contracts/domain.ts";
import type { Status } from "../contracts/domain.ts";
import type { SyncMessage } from "../contracts/sync.ts";
import { notionSchemaChanges, richText, schemaError } from "../integrations/notion-schema.ts";
import type { NotionProperties } from "../integrations/notion-schema.ts";
import { markdownToNotionBlocks } from "../integrations/notion-blocks.ts";
import { notionText } from "../integrations/notion.ts";
import { markdownToPlainText } from "../lib/markdown.ts";
import { syncState } from "../db/schema.ts";
import { isPublicPost, publiclyVisible } from "../server/visibility.ts";
import { autoDraftStatements } from "../server/changelog-draft.ts";
import { emitStatusChanges } from "../server/webhooks.ts";
import type { NotionList, NotionPage } from "../integrations/notion.ts";
import {
  config,
  db,
  env,
  portalUrl,
  posts,
  providerRequest,
  readPost,
  readState,
  writeState,
  watermark,
} from "./shared.ts";
import type { SyncPost } from "./shared.ts";
import { queueEmails, statusEmails, type StatusChange } from "../email/events.ts";

function mirrorProperties(post: SyncPost) {
  return {
    Name: { title: richText(post.title) },
    // The text only; the formatted body is the page content (see `bodyBlocks`).
    Description: { rich_text: richText(markdownToPlainText(post.body)) },
    Category: { select: { name: CATEGORY_LABELS[post.category] } },
    Votes: { number: post.votes },
    Comments: { number: post.comments },
    Author: { rich_text: richText(post.author) },
    Portal: { url: `${portalUrl()}/posts/${post.id}` },
    GitHub: { url: post.githubUrl },
    Images: {
      files: post.images.map((image) => ({
        name: `Image ${image.position + 1}`,
        type: "external",
        external: { url: `${portalUrl()}/api/media/${image.id}` },
      })),
    },
    Created: { date: { start: new Date(post.createdAt).toISOString() } },
  };
}

/**
 * The formatted body as page content, written once when the page is created. Posts are not
 * edited after they are written, and updates only touch the properties above, so the body
 * never has to be rewritten block by block.
 */
function bodyBlocks(post: SyncPost) {
  const children = markdownToNotionBlocks(post.body, `${portalUrl()}/posts/${post.id}`);
  return children.length ? { children } : {};
}

export async function mirrorPost(postId: string): Promise<void> {
  const database = db();
  const post = await readPost(postId);
  if (!post) return;
  const moderationKey = `notion.moderated.${post.id}`;
  const archive = async (id: string) => {
    // Persist a discovered/created page before archiving: if moderation won the lookup
    // race, the cron must still be able to retry cleanup and restore this same mirror.
    const current = await database.select().from(posts).where(eq(posts.id, post.id)).get();
    if (current) {
      await database.update(posts).set({ notionPageId: id }).where(eq(posts.id, post.id));
      if ((await readState<string>(moderationKey)) !== id) {
        // Do not claim a page someone already trashed: unhide must respect that choice.
        let page: NotionPage | undefined;
        try {
          page = await providerRequest("notion")<NotionPage>(`/pages/${id}`);
        } catch (error) {
          if (!(error instanceof IntegrationError) || error.status !== 404) throw error;
        }
        if (page && !page.in_trash && !page.archived && !page.is_archived)
          await writeState(moderationKey, id);
      }
    }
    await archiveNotionPage(id);
    await database
      .update(posts)
      .set({ notionRevision: post.revision })
      .where(eq(posts.id, post.id));
  };
  if (!isPublicPost(post)) {
    // Never serialize moderated content. Existing mirrors go to trash; remember ownership
    // before the request so a retry can restore only pages that Feedbax itself archived.
    if (!post.notionPageId || post.notionRevision >= post.revision) return;
    await archive(post.notionPageId);
    return;
  }
  if (post.notionBlocked || (post.notionPageId && post.notionRevision >= post.revision)) return;
  const request = providerRequest("notion");
  let pageId = post.notionPageId;
  const block = async (id: string | null) => {
    await database
      .update(posts)
      .set({ notionBlocked: 1, notionPageId: id })
      .where(eq(posts.id, post.id));
    console.warn({ type: "notion.mirror.blocked", postId: post.id });
  };
  const patch = async (id: string, body: unknown) => {
    // A provider lookup may have yielded to moderation. Never send the stale snapshot.
    const current = await database.select().from(posts).where(eq(posts.id, post.id)).get();
    if (!isPublicPost(current)) {
      await archive(id);
      return false;
    }
    try {
      await request(`/pages/${id}`, "PATCH", body);
      return true;
    } catch (error) {
      if (!(error instanceof IntegrationError) || ![400, 404].includes(error.status ?? 0))
        throw error;
      let missing = false;
      let row: NotionPage | undefined;
      try {
        row = await request<NotionPage>(`/pages/${id}`);
      } catch (readError) {
        if (!(readError instanceof IntegrationError) || readError.status !== 404) throw readError;
        missing = true;
      }
      if (!missing && !row?.in_trash && !row?.archived && !row?.is_archived) throw error;
      // A page-local 404 can also mean the entire database lost access. Verify the
      // source and schema before suppressing the individual row. Extra I/O only on failure.
      const source = await request<{ properties: NotionProperties; in_trash?: boolean }>(
        `/data_sources/${config.integrations.notion.dataSourceId}`,
      );
      if (source.in_trash) throw schemaError("The Feedbax Notion data source is in trash.");
      notionSchemaChanges(source.properties);
      await block(id);
      return false;
    }
  };
  if (!pageId) {
    const found = await request<NotionList<NotionPage>>(
      `/data_sources/${config.integrations.notion.dataSourceId}/query`,
      "POST",
      {
        filter: { property: "Feedbax ID", rich_text: { equals: post.id } },
        page_size: 100,
      },
    );
    // A trashed row is still the same mirror. Never create a replacement or restore it.
    const existing = found.results[0];
    if (existing?.in_trash || existing?.archived || existing?.is_archived) {
      await block(existing.id);
      return;
    }
    pageId = existing?.id ?? null;
    if (!pageId) {
      const current = await database.select().from(posts).where(eq(posts.id, post.id)).get();
      if (!isPublicPost(current)) return;
      const created = await request<NotionPage>("/pages", "POST", {
        parent: { type: "data_source_id", data_source_id: config.integrations.notion.dataSourceId },
        properties: {
          ...mirrorProperties(post),
          "Feedbax ID": { rich_text: richText(post.id) },
          Status: { select: { name: "Open" } },
          "Send to GitHub": { checkbox: false },
        },
        ...bodyBlocks(post),
      });
      pageId = created.id;
      if (!pageId) throw schemaError("Notion did not return the created page ID.");
      // A create already in flight cannot be recalled. Archive its result if the post
      // was moderated/deleted while Notion handled it, rather than orphaning a mirror.
      const afterCreate = await database.select().from(posts).where(eq(posts.id, post.id)).get();
      if (!isPublicPost(afterCreate)) {
        await archive(pageId);
        return;
      }
      // A late create can follow a GitHub close. Its final status still needs repair.
      if (post.githubClosedAt !== null)
        if (!(await patch(pageId, { properties: { Status: { select: { name: "Done" } } } })))
          return;
    } else {
      if (
        !(await patch(pageId, {
          properties: {
            ...mirrorProperties(post),
            ...(post.githubClosedAt !== null ? { Status: { select: { name: "Done" } } } : {}),
          },
        }))
      )
        return;
    }
  } else {
    const restore = (await readState<string>(moderationKey)) === pageId;
    if (
      !(await patch(pageId, {
        ...(restore ? { in_trash: false } : {}),
        properties: {
          ...mirrorProperties(post),
          ...(post.githubClosedAt !== null ? { Status: { select: { name: "Done" } } } : {}),
        },
      }))
    )
      return;
    if (restore) await database.delete(syncState).where(eq(syncState.key, moderationKey));
  }
  await database
    .update(posts)
    .set({ notionPageId: pageId, notionRevision: post.revision })
    .where(eq(posts.id, post.id));
}

const NOTION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Moves the Notion row of a post deleted from /admin/moderation to trash. The post is already
 * gone from D1, so a row that is missing or already in trash counts as done.
 */
export async function archiveNotionPage(pageId: string): Promise<void> {
  if (!NOTION_UUID.test(pageId)) return;
  const request = providerRequest("notion");
  try {
    await request(`/pages/${pageId}`, "PATCH", { in_trash: true });
  } catch (error) {
    if (!(error instanceof IntegrationError) || ![400, 404].includes(error.status ?? 0))
      throw error;
    let row: NotionPage;
    try {
      row = await request<NotionPage>(`/pages/${pageId}`);
    } catch (readError) {
      if (readError instanceof IntegrationError && readError.status === 404) return;
      throw readError;
    }
    if (row.in_trash || row.archived || row.is_archived) return;
    throw error;
  }
}

export async function pollNotion(
  message: Extract<SyncMessage, { type: "notion.poll" }>,
): Promise<void> {
  const database = db();
  const request = providerRequest("notion", "poll");
  const path = `/data_sources/${config.integrations.notion.dataSourceId}`;
  const source = await request<{ properties: NotionProperties; in_trash?: boolean }>(path);
  if (source.in_trash) throw schemaError("The Feedbax Notion data source is in trash.");
  notionSchemaChanges(source.properties);
  const result = await request<NotionList<NotionPage>>(`${path}/query`, "POST", {
    filter: {
      and: [
        { timestamp: "last_edited_time", last_edited_time: { on_or_after: message.since } },
        { timestamp: "last_edited_time", last_edited_time: { on_or_before: message.until } },
      ],
    },
    sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    page_size: 100,
    ...(message.cursor ? { start_cursor: message.cursor } : {}),
  });
  // One indexed lookup for the whole page keeps a 100-row poll below D1 Free's
  // 50-query invocation limit. Only known UUIDs ever reach SQL.
  const ids = [
    ...new Set(result.results.map((page) => notionText(page.properties["Feedbax ID"]?.rich_text))),
  ].filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const known = ids.length ? await database.select().from(posts).where(inArray(posts.id, ids)) : [];
  const byId = new Map(known.map((post) => [post.id, post]));
  const updates: BatchItem<"sqlite">[] = [];
  // Posts this poll moves to Done get a draft changelog entry in the same batch.
  const shipped: { id: string; body: string }[] = [];
  const statusChanges: { id: string; previous: Status }[] = [];
  const approvals = new Set<string>();
  const emailChanges: StatusChange[] = [];
  const seen = new Set<string>();
  for (const page of result.results) {
    if (page.in_trash || page.archived || page.is_archived || seen.has(page.id)) continue;
    seen.add(page.id);
    const id = notionText(page.properties["Feedbax ID"]?.rich_text);
    if (!id) continue;
    const post = byId.get(id);
    if (!post || post.notionPageId !== page.id) continue;
    // Leave Send to GitHub untouched for non-public posts. No approval, status update,
    // notification or re-enqueue; restoring the post makes the existing choice active again.
    if (!isPublicPost(post)) continue;
    const statusProperty = page.properties.Status;
    const approvalProperty = page.properties["Send to GitHub"];
    if (
      !statusProperty ||
      (statusProperty.type && statusProperty.type !== "select") ||
      !approvalProperty ||
      (approvalProperty.type && approvalProperty.type !== "checkbox")
    ) {
      throw schemaError("Notion row is missing Status (select) or Send to GitHub (checkbox).");
    }
    const label = statusProperty.select?.name;
    const status = (Object.entries(STATUS_LABELS) as [Status, string][]).find(
      ([, value]) => value === label,
    )?.[0];
    if (!status) console.warn({ type: "notion.status.ignored", postId: post.id, status: null });
    const changes: Partial<typeof posts.$inferInsert> = {};
    if (post.notionBlocked) changes.notionBlocked = 0;
    if (post.githubClosedAt !== null) {
      if (status !== "done" && post.notionRevision >= post.revision)
        changes.revision = post.revision + 1;
    } else if (status && status !== post.status) {
      changes.status = status;
      changes.updatedAt = Date.now();
      statusChanges.push({ id: post.id, previous: post.status });
      if (status === "done") shipped.push({ id: post.id, body: post.body });
      emailChanges.push({
        post: { id: post.id, title: post.title, body: post.body },
        from: post.status,
        to: status,
      });
    }
    if (config.integrations.github && approvalProperty.checkbox === true) {
      if (!post.githubRequested) changes.githubRequested = 1;
      // Resend already-approved pending work too: a send can fail after the D1 batch.
      if (post.githubNumber === null) approvals.add(post.id);
    }
    if (Object.keys(changes).length) {
      // SQL increment preserves concurrent API vote/comment revisions.
      const update = database
        .update(posts)
        .set({ ...changes, ...(changes.revision ? { revision: sql`${posts.revision} + 1` } : {}) })
        .where(and(eq(posts.id, post.id), publiclyVisible));
      updates.push(update);
    }
  }
  // After the status updates: the draft statements check the post is Done at that point.
  updates.push(...(await autoDraftStatements(database, shipped)));
  if (updates.length)
    await database.batch(updates as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  // After the batch, so only stored changes notify. Best effort, never fails the poll.
  await queueEmails(statusEmails(emailChanges));
  // After the write: webhooks never fail the poll, and a retry would not see a change again.
  if (statusChanges.length) await emitStatusChanges(statusChanges);
  if (approvals.size)
    await env.SYNC_QUEUE.sendBatch(
      [...approvals].map((postId) => ({
        body: { type: "github.issue", postId } satisfies SyncMessage,
      })),
    );
  if (result.has_more) {
    if (!result.next_cursor) throw schemaError("Notion query returned no pagination cursor.");
    await env.SYNC_QUEUE.send({ ...message, cursor: result.next_cursor });
  } else await watermark("notion", message.until);
}
