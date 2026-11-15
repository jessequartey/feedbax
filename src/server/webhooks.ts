import { notifyQueue } from "../notifications/queue.ts";
import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { CommentView, Status } from "../contracts/domain.ts";
import type { NotifyMessage } from "../contracts/sync.ts";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_LIMITS,
  WEBHOOK_RETRY_SECONDS,
  type AdminWebhooks,
  type WebhookData,
  type WebhookDeliveryEvent,
  type WebhookDeliveryView,
  type WebhookEndpointView,
  type WebhookEnvelope,
  type WebhookEventType,
  type WebhookPost,
} from "../contracts/webhooks.ts";
import { createDb } from "../db/client.ts";
import { comments, posts, user, votes, webhookDeliveries, webhookEndpoints } from "../db/schema.ts";
import { markdownToPlainText } from "../lib/markdown.ts";
import { webhookUrlProblem } from "../lib/webhook-url.ts";
import { DomainError, invalid } from "./errors.ts";
import { choice, record, uuid } from "./validation.ts";
import { publiclyVisible } from "./visibility.ts";

// Webhooks (opt-in): admins add endpoints in /admin/settings → Webhooks; nothing is stored,
// queued or sent until one exists. Events are written as `webhook_deliveries` rows (the payload
// is kept so every retry sends the same bytes) and delivered as `webhook.deliver` messages
// through NOTIFY_QUEUE (SYNC_QUEUE until migrated). Each request is signed with the endpoint's own secret:
//   X-Feedbax-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
// The secret is stored so it can sign; it leaves the server only at creation, rotate and
// reveal, each an admin-only call.

const iso = (ms: number) => new Date(ms).toISOString();
const portalUrl = () => env.PORTAL_URL.replace(/\/$/, "");
/** Local development (an http PORTAL_URL) may use http and private hosts; production may not. */
export const lenientUrls = () => !env.PORTAL_URL.startsWith("https://");
const db = () => createDb(env.DB);

// ---- Events: build payloads and enqueue them ----

/** Plain text of a Markdown body. One helper for every payload. */
export const plainText = markdownToPlainText;

type Author = { name: string; anonymous: boolean };
const author = (name: string, anonymous: boolean | null): Author => ({
  name: anonymous ? "Anonymous" : name,
  anonymous: Boolean(anonymous),
});

async function loadPosts(ids: string[]): Promise<Map<string, WebhookPost>> {
  const out = new Map<string, WebhookPost>();
  if (!ids.length) return out;
  const rows = await db()
    .select({
      post: posts,
      name: user.name,
      anonymous: user.isAnonymous,
      votes:
        sql<number>`(SELECT count(*) FROM ${votes} WHERE ${votes.postId} = ${posts.id})`.mapWith(
          Number,
        ),
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    // Hidden, spam and merged posts do not exist for anyone but admins: no events for them.
    .where(and(inArray(posts.id, ids), publiclyVisible));
  for (const { post, name, anonymous, votes: count } of rows)
    out.set(post.id, {
      id: post.id,
      title: post.title,
      body: post.body,
      bodyText: plainText(post.body),
      category: post.category,
      status: post.status,
      url: `${portalUrl()}/posts/${post.id}`,
      votes: count,
      author: author(name, anonymous),
      createdAt: iso(post.createdAt),
    });
  return out;
}

async function loadPostRef(id: string) {
  const row = await db()
    .select({
      id: posts.id,
      title: posts.title,
      votes:
        sql<number>`(SELECT count(*) FROM ${votes} WHERE ${votes.postId} = ${posts.id})`.mapWith(
          Number,
        ),
    })
    .from(posts)
    .where(and(eq(posts.id, id), publiclyVisible))
    .get();
  return row
    ? { id: row.id, title: row.title, url: `${portalUrl()}/posts/${row.id}`, votes: row.votes }
    : null;
}

/**
 * The one entry point for events. It first reads the enabled endpoints that want `type` (one
 * indexed D1 read, the only cost when webhooks are unused), then builds the payloads with
 * `load`, stores one delivery per payload and endpoint, and enqueues them. It never throws:
 * a webhook problem must not fail a post, comment, vote, sync or publish. Callers on the request
 * path hand it to `waitUntil`; the sync consumer awaits it.
 */
export async function emitWebhooks<E extends WebhookEventType>(
  type: E,
  load: () => Promise<WebhookData[E][]>,
): Promise<void> {
  try {
    const endpoints = (
      await db().select().from(webhookEndpoints).where(eq(webhookEndpoints.enabled, 1))
    ).filter((endpoint) => (JSON.parse(endpoint.events) as string[]).includes(type));
    if (!endpoints.length) return;
    const items = (await load()).slice(
      0,
      Math.max(1, Math.floor(WEBHOOK_LIMITS.perEmit / endpoints.length)),
    );
    if (!items.length) return;
    const now = Date.now();
    const rows = items.flatMap((data) => {
      const envelope: WebhookEnvelope<E> = {
        id: crypto.randomUUID(),
        type,
        createdAt: iso(now),
        data,
      } as WebhookEnvelope<E>;
      const payload = JSON.stringify(envelope);
      return endpoints.map((endpoint) => ({
        id: crypto.randomUUID(),
        endpointId: endpoint.id,
        event: type,
        payload,
        createdAt: now,
        updatedAt: now,
      }));
    });
    await storeAndEnqueue(
      rows,
      endpoints.map((endpoint) => endpoint.id),
    );
  } catch {
    // Never serialize the error: it can carry endpoint URLs.
    console.error({ type: "webhook.emit_failed", event: type });
  }
}

type NewDelivery = typeof webhookDeliveries.$inferInsert;

async function storeAndEnqueue(rows: NewDelivery[], endpointIds: string[]): Promise<void> {
  const database = db();
  // Cap delivered and failed history. A pending row is still in flight: the consumer treats
  // a missing row as success, so pruning one would drop a delivery that may never be sent.
  const prune = [...new Set(endpointIds)].map((id) =>
    database
      .delete(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.endpointId, id),
          sql`${webhookDeliveries.status} <> 'pending'`,
          sql`${webhookDeliveries.id} NOT IN (SELECT id FROM webhook_deliveries WHERE endpoint_id = ${id} AND status <> 'pending' ORDER BY created_at DESC, id DESC LIMIT ${WEBHOOK_LIMITS.historyPerEndpoint})`,
        ),
      ),
  );
  const inserts = rows.map((row) => database.insert(webhookDeliveries).values(row));
  await database.batch([...inserts, ...prune] as unknown as [
    (typeof inserts)[number],
    ...typeof inserts,
  ]);
  try {
    await notifyQueue().sendBatch(
      rows.map((row) => ({
        body: { type: "webhook.deliver", deliveryId: row.id } satisfies NotifyMessage,
      })),
    );
  } catch {
    await markFailed(
      rows.map((row) => row.id!),
      "Could not be queued",
    );
  }
}

async function markFailed(ids: string[], message: string): Promise<void> {
  await db()
    .update(webhookDeliveries)
    .set({ status: "failed", lastError: message, updatedAt: Date.now() })
    .where(and(inArray(webhookDeliveries.id, ids), eq(webhookDeliveries.status, "pending")))
    .catch(() => undefined);
}

/** post.created: called after the post is stored (request path: `waitUntil`). */
export function emitPostCreated(postId: string): Promise<void> {
  return emitWebhooks("post.created", async () => {
    const post = (await loadPosts([postId])).get(postId);
    return post ? [{ post }] : [];
  });
}

/** post.status_changed: `changes` carry the status each post had before the write. */
export function emitStatusChanges(changes: { id: string; previous: Status }[]): Promise<void> {
  return emitWebhooks("post.status_changed", async () => {
    const found = await loadPosts(changes.map((change) => change.id));
    return changes.flatMap(({ id, previous }) => {
      const post = found.get(id);
      return post && post.status !== previous
        ? [{ post, previousStatus: previous, status: post.status }]
        : [];
    });
  });
}

export function emitCommentCreated(comment: CommentView): Promise<void> {
  return emitWebhooks("comment.created", async () => {
    const post = await loadPostRef(comment.postId);
    return post
      ? [
          {
            comment: {
              id: comment.id,
              body: comment.body,
              bodyText: plainText(comment.body),
              author: { name: comment.author.name, anonymous: comment.author.anonymous },
              createdAt: comment.createdAt,
            },
            post: { id: post.id, title: post.title, url: post.url },
          },
        ]
      : [];
  });
}

/** vote.created. The voter is deliberately not part of the payload. */
export function emitVoteCreated(postId: string): Promise<void> {
  return emitWebhooks("vote.created", async () => {
    const post = await loadPostRef(postId);
    return post ? [{ post }] : [];
  });
}

export function emitChangelogWebhook(event: {
  entry: { id: string; title: string; body: string; publishedAt: string; postIds: string[] };
  url: string;
}): Promise<void> {
  return emitWebhooks("changelog.published", async () => {
    const publicPosts = await loadPosts(event.entry.postIds);
    return [
      {
        entry: {
          id: event.entry.id,
          title: event.entry.title,
          body: event.entry.body,
          bodyText: plainText(event.entry.body),
          publishedAt: event.entry.publishedAt,
          url: event.url,
          postIds: event.entry.postIds.filter((id) => publicPosts.has(id)),
        },
      },
    ];
  });
}

// ---- Delivery (queue consumer) ----

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** `t=<seconds>,v1=<hex>`: HMAC-SHA256 over `<seconds>.<raw body>` keyed with the endpoint secret. */
export async function signWebhook(secret: string, body: string, seconds: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${seconds}.${body}`));
  return `t=${seconds},v1=${hex(mac)}`;
}

/** Seconds from a Retry-After header, capped at an hour; 0 when absent or not a number. */
function retryAfterSeconds(value: string | null): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 3600) : 0;
}

const TRANSIENT_STATUS = new Set([408, 425, 429]);

/** Stored event bytes can outlive moderation (including between retries). Recheck on send. */
async function deliveryIsPublic(payload: string): Promise<boolean> {
  const { data } = JSON.parse(payload) as WebhookEnvelope;
  const ids = "post" in data ? [data.post.id] : "entry" in data ? data.entry.postIds : [];
  if (!ids.length) return true;
  const visible = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        inArray(posts.id, ids),
        publiclyVisible,
        "comment" in data
          ? sql`EXISTS (SELECT 1 FROM ${comments} WHERE ${comments.id} = ${data.comment.id} AND ${comments.postId} = ${posts.id} AND ${comments.hiddenAt} IS NULL)`
          : undefined,
      ),
    );
  return visible.length === new Set(ids).size;
}

/**
 * Makes one attempt. Resolves to the delay (seconds) before the next attempt, or null when the
 * delivery is finished (delivered, failed for good, or gone) and the message can be acked.
 * A thrown error (D1 down) is for the consumer to retry.
 */
export async function deliverWebhook(deliveryId: string): Promise<number | null> {
  const database = db();
  const row = await database
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .leftJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(eq(webhookDeliveries.id, deliveryId))
    .get();
  // Pruned, deleted with its endpoint, or already finished (a duplicate queue message).
  if (!row || row.delivery.status !== "pending") return null;
  const { delivery, endpoint } = row;
  const finish = (
    status: "delivered" | "failed",
    responseStatus: number | null,
    error: string | null,
  ) =>
    database
      .update(webhookDeliveries)
      .set({ status, responseStatus, lastError: error, updatedAt: Date.now() })
      .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.status, "pending")));
  if (!endpoint || !endpoint.enabled) {
    await finish("failed", null, "Endpoint is disabled");
    return null;
  }
  if (!(await deliveryIsPublic(delivery.payload))) {
    await finish("failed", null, "Content is no longer public");
    return null;
  }
  // Checked again at send time: the rule may be stricter than when the endpoint was saved.
  if (webhookUrlProblem(endpoint.url, lenientUrls())) {
    await finish("failed", null, "Address is not allowed");
    return null;
  }
  const claimed = await database
    .update(webhookDeliveries)
    .set({ attempts: sql`${webhookDeliveries.attempts} + 1`, updatedAt: Date.now() })
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.status, "pending")))
    .returning({ attempts: webhookDeliveries.attempts });
  if (!claimed.length) return null;
  const attempt = claimed[0]!.attempts;

  let status: number | null = null;
  let error: string | null = null;
  let wait = 0;
  let permanent = false;
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      // A redirect could lead anywhere, private addresses included: never follow one.
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_LIMITS.timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Feedbax-Webhooks/1",
        "X-Feedbax-Event": delivery.event,
        "X-Feedbax-Delivery": delivery.id,
        "X-Feedbax-Signature": await signWebhook(
          endpoint.secret,
          delivery.payload,
          Math.floor(Date.now() / 1000),
        ),
      },
      body: delivery.payload,
    });
    status = response.status;
    wait = retryAfterSeconds(response.headers.get("Retry-After"));
    // Only the status matters; never read, store or log what the receiver answered.
    void response.body?.cancel().catch(() => undefined);
    if (status >= 200 && status < 300) {
      await finish("delivered", status, null);
      return null;
    }
    error =
      status >= 300 && status < 400 ? `Redirect (HTTP ${status}) not followed` : `HTTP ${status}`;
    permanent = status < 500 && !TRANSIENT_STATUS.has(status);
  } catch (caught) {
    const name = caught instanceof Error ? caught.name : "";
    error = name === "TimeoutError" || name === "AbortError" ? "Timed out" : "Connection failed";
  }
  if (permanent || attempt >= WEBHOOK_LIMITS.attempts) {
    await finish("failed", status, error);
    return null;
  }
  await database
    .update(webhookDeliveries)
    .set({ responseStatus: status, lastError: error, updatedAt: Date.now() })
    .where(eq(webhookDeliveries.id, deliveryId));
  return Math.max(
    wait,
    WEBHOOK_RETRY_SECONDS[Math.min(attempt, WEBHOOK_RETRY_SECONDS.length) - 1]!,
  );
}

// ---- Admin (callers have passed requireAdmin: see admin-api.ts) ----

const newSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `whsec_${btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;
};

function eventList(value: unknown): WebhookEventType[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > WEBHOOK_EVENTS.length)
    invalid("events");
  const chosen = new Set(value.map((item) => choice(item, WEBHOOK_EVENTS, "events")));
  // Stored in the canonical order, without duplicates.
  return WEBHOOK_EVENTS.filter((event) => chosen.has(event));
}

function urlInput(value: unknown): string {
  const problem = webhookUrlProblem(value, lenientUrls());
  if (problem) throw new DomainError("invalid_input", problem, "url");
  return new URL(value as string).toString();
}

const endpointView = (
  row: typeof webhookEndpoints.$inferSelect,
  last: WebhookEndpointView["last"] = null,
): WebhookEndpointView => ({
  id: row.id,
  url: row.url,
  events: JSON.parse(row.events) as WebhookEventType[],
  enabled: row.enabled === 1,
  createdAt: iso(row.createdAt),
  last,
});

async function readEndpoint(id: string) {
  const row = await db().select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)).get();
  if (!row) throw new DomainError("not_found", "Endpoint not found.");
  return row;
}

export async function listWebhooks(): Promise<AdminWebhooks> {
  const database = db();
  const [endpoints, deliveries, lasts] = await Promise.all([
    database
      .select()
      .from(webhookEndpoints)
      .orderBy(webhookEndpoints.createdAt, webhookEndpoints.id),
    database
      .select({
        id: webhookDeliveries.id,
        endpointId: webhookDeliveries.endpointId,
        endpointUrl: webhookEndpoints.url,
        event: webhookDeliveries.event,
        status: webhookDeliveries.status,
        attempts: webhookDeliveries.attempts,
        responseStatus: webhookDeliveries.responseStatus,
        error: webhookDeliveries.lastError,
        createdAt: webhookDeliveries.createdAt,
        updatedAt: webhookDeliveries.updatedAt,
      })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
      .limit(WEBHOOK_LIMITS.recentDeliveries),
    database.all<{
      endpoint_id: string;
      status: WebhookDeliveryView["status"];
      created_at: number;
    }>(
      sql`SELECT endpoint_id, status, created_at FROM webhook_deliveries d WHERE id = (SELECT id FROM webhook_deliveries WHERE endpoint_id = d.endpoint_id ORDER BY created_at DESC, id DESC LIMIT 1)`,
    ),
  ]);
  const last = new Map(
    lasts.map((row) => [row.endpoint_id, { status: row.status, at: iso(row.created_at) }]),
  );
  return {
    endpoints: endpoints.map((row) => endpointView(row, last.get(row.id) ?? null)),
    deliveries: deliveries.map((row) => ({
      ...row,
      event: row.event as WebhookDeliveryEvent,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
    lenient: lenientUrls(),
  };
}

export async function createWebhook(input: unknown) {
  const data = record(input);
  const url = urlInput(data.url);
  const events = eventList(data.events);
  const database = db();
  const count = await database
    .select({ n: sql<number>`count(*)` })
    .from(webhookEndpoints)
    .get();
  if (count!.n >= WEBHOOK_LIMITS.endpoints)
    throw new DomainError("conflict", `You can add up to ${WEBHOOK_LIMITS.endpoints} endpoints.`);
  const now = Date.now();
  const row = {
    id: crypto.randomUUID(),
    url,
    secret: newSecret(),
    events: JSON.stringify(events),
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  };
  await database.insert(webhookEndpoints).values(row);
  // The only time the secret is returned with its endpoint; reveal and rotate return it too.
  return { endpoint: endpointView(row), secret: row.secret };
}

export async function updateWebhook(input: unknown) {
  const data = record(input);
  const id = uuid(data.id);
  const set: Partial<typeof webhookEndpoints.$inferInsert> = {};
  if (data.url !== undefined) set.url = urlInput(data.url);
  if (data.events !== undefined) set.events = JSON.stringify(eventList(data.events));
  if (data.enabled !== undefined) {
    if (typeof data.enabled !== "boolean") invalid("enabled");
    set.enabled = data.enabled ? 1 : 0;
  }
  if (!Object.keys(set).length) invalid();
  await readEndpoint(id);
  await db()
    .update(webhookEndpoints)
    .set({ ...set, updatedAt: Date.now() })
    .where(eq(webhookEndpoints.id, id));
  return endpointView(await readEndpoint(id));
}

export async function deleteWebhook(input: unknown) {
  const id = uuid(record(input).id);
  await readEndpoint(id);
  // Its deliveries go with it (ON DELETE CASCADE).
  await db().delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  return { id };
}

export async function revealWebhookSecret(input: unknown) {
  return { secret: (await readEndpoint(uuid(record(input).id))).secret };
}

export async function rotateWebhookSecret(input: unknown) {
  const id = uuid(record(input).id);
  await readEndpoint(id);
  const secret = newSecret();
  await db()
    .update(webhookEndpoints)
    .set({ secret, updatedAt: Date.now() })
    .where(eq(webhookEndpoints.id, id));
  // Deliveries still waiting to retry are signed with the new secret at send time.
  return { secret };
}

/** Queues a `webhook.test` delivery, so it shows in the log like any other. */
export async function testWebhook(input: unknown) {
  const endpoint = await readEndpoint(uuid(record(input).id));
  if (!endpoint.enabled) throw new DomainError("conflict", "Enable the endpoint to send a test.");
  const now = Date.now();
  const envelope: WebhookEnvelope<"webhook.test"> = {
    id: crypto.randomUUID(),
    type: "webhook.test",
    createdAt: iso(now),
    data: { message: "This is a test delivery from Feedbax." },
  };
  const row = {
    id: crypto.randomUUID(),
    endpointId: endpoint.id,
    event: "webhook.test",
    payload: JSON.stringify(envelope),
    createdAt: now,
    updatedAt: now,
  };
  await storeAndEnqueue([row], [endpoint.id]);
  return { deliveryId: row.id };
}
