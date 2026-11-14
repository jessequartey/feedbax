import type { BatchItem } from "drizzle-orm/batch";
import { eq, inArray, sql } from "drizzle-orm";
import { CATEGORY_LABELS, STATUS_LABELS } from "../contracts/domain.ts";
import type { Status } from "../contracts/domain.ts";
import type { SyncMessage } from "../contracts/sync.ts";
import { notionSchemaChanges, richText, schemaError } from "../integrations/notion-schema.ts";
import type { NotionProperties } from "../integrations/notion-schema.ts";
import { notionText } from "../integrations/notion.ts";
import type { NotionList, NotionPage } from "../integrations/notion.ts";
import {
  config,
  db,
  env,
  portalUrl,
  posts,
  providerRequest,
  readPost,
  watermark,
} from "./shared.ts";
import type { SyncPost } from "./shared.ts";

function mirrorProperties(post: SyncPost) {
  return {
    Name: { title: richText(post.title) },
    Description: { rich_text: richText(post.body) },
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

export async function mirrorPost(postId: string): Promise<void> {
  const database = db();
  const post = await readPost(postId);
  if (!post || (post.notionPageId && post.notionRevision >= post.revision)) return;
  const request = providerRequest("notion");
  let pageId = post.notionPageId;
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
    if (existing?.in_trash)
      throw schemaError("The mirrored Notion page is in trash; restore it to resume sync.");
    pageId = existing?.id ?? null;
    if (!pageId) {
      const created = await request<NotionPage>("/pages", "POST", {
        parent: { type: "data_source_id", data_source_id: config.integrations.notion.dataSourceId },
        properties: {
          ...mirrorProperties(post),
          "Feedbax ID": { rich_text: richText(post.id) },
          Status: { select: { name: "Open" } },
          "Send to GitHub": { checkbox: false },
        },
      });
      pageId = created.id;
      if (!pageId) throw schemaError("Notion did not return the created page ID.");
      // A late create can follow a GitHub close. Its final status still needs repair.
      if (post.githubClosedAt !== null)
        await request(`/pages/${pageId}`, "PATCH", {
          properties: { Status: { select: { name: "Done" } } },
        });
    } else {
      await request(`/pages/${pageId}`, "PATCH", {
        properties: {
          ...mirrorProperties(post),
          ...(post.githubClosedAt !== null ? { Status: { select: { name: "Done" } } } : {}),
        },
      });
    }
  } else {
    await request(`/pages/${pageId}`, "PATCH", {
      properties: {
        ...mirrorProperties(post),
        ...(post.githubClosedAt !== null ? { Status: { select: { name: "Done" } } } : {}),
      },
    });
  }
  await database
    .update(posts)
    .set({ notionPageId: pageId, notionRevision: post.revision })
    .where(eq(posts.id, post.id));
}

export async function pollNotion(
  message: Extract<SyncMessage, { type: "notion.poll" }>,
): Promise<void> {
  const database = db();
  const request = providerRequest("notion");
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
  const approvals = new Set<string>();
  const seen = new Set<string>();
  for (const page of result.results) {
    if (page.in_trash || seen.has(page.id)) continue;
    seen.add(page.id);
    const id = notionText(page.properties["Feedbax ID"]?.rich_text);
    if (!id) continue;
    const post = byId.get(id);
    if (!post || post.notionPageId !== page.id) continue;
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
    if (post.githubClosedAt !== null) {
      if (status !== "done" && post.notionRevision >= post.revision)
        changes.revision = post.revision + 1;
    } else if (status && status !== post.status) {
      changes.status = status;
      changes.updatedAt = Date.now();
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
        .where(eq(posts.id, post.id));
      updates.push(update);
    }
  }
  if (updates.length)
    await database.batch(updates as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
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
