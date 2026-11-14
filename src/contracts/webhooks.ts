import type { Category, Status } from "./domain.ts";

// Shapes shared by the webhook server code, the queue consumer and /admin/settings → Webhooks.
// Types and limits only. The payloads below are the public contract with receivers: add fields,
// never rename or remove them.

export const WEBHOOK_EVENTS = [
  "post.created",
  "post.status_changed",
  "comment.created",
  "vote.created",
  "changelog.published",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];
/** `webhook.test` is only ever sent by "Send test" in the admin; endpoints never subscribe to it. */
export type WebhookDeliveryEvent = WebhookEventType | "webhook.test";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  "post.created": "A post is created",
  "post.status_changed": "A post's status changes",
  "comment.created": "A comment is added",
  "vote.created": "A vote is added",
  "changelog.published": "A changelog entry is published",
};

export const WEBHOOK_LIMITS = {
  /** Endpoints per portal: bounds the fan-out of one event. */
  endpoints: 10,
  url: 2048,
  /** Deliveries kept per endpoint; older rows are pruned when new ones are created. */
  historyPerEndpoint: 100,
  /** Deliveries created by one emit (a poll that moves many posts at once). */
  perEmit: 50,
  /** Deliveries the admin list shows. */
  recentDeliveries: 30,
  /** Seconds before an unanswered request is given up (counts as a failed attempt). */
  timeoutMs: 8000,
  /** Total tries per delivery, the first one included. */
  attempts: 6,
} as const;
/** Seconds to wait after failed attempt 1, 2, 3 …; the same schedule the docs promise. */
export const WEBHOOK_RETRY_SECONDS = [30, 120, 600, 3600, 21_600] as const;

// ---- Payloads (the JSON request body) ----

/** `body` is the Markdown source, `bodyText` the same content as plain text. */
export type WebhookPost = {
  id: string;
  title: string;
  body: string;
  bodyText: string;
  category: Category;
  status: Status;
  url: string;
  votes: number;
  author: { name: string; anonymous: boolean };
  createdAt: string;
};
export type WebhookPostRef = { id: string; title: string; url: string };

export type WebhookData = {
  "post.created": { post: WebhookPost };
  "post.status_changed": { post: WebhookPost; previousStatus: Status; status: Status };
  "comment.created": {
    comment: {
      id: string;
      body: string;
      bodyText: string;
      author: { name: string; anonymous: boolean };
      createdAt: string;
    };
    post: WebhookPostRef;
  };
  "vote.created": { post: WebhookPostRef & { votes: number } };
  "changelog.published": {
    entry: {
      id: string;
      title: string;
      body: string;
      bodyText: string;
      publishedAt: string;
      url: string;
      postIds: string[];
    };
  };
};
export type WebhookEnvelope<E extends WebhookEventType | "webhook.test" = WebhookDeliveryEvent> = {
  /** One id per event, shared by every endpoint it is delivered to. */
  id: string;
  type: E;
  createdAt: string;
  data: E extends WebhookEventType ? WebhookData[E] : { message: string };
};

// ---- Admin views. The signing secret is never part of them. ----

export type WebhookEndpointView = {
  id: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  createdAt: string;
  /** The most recent delivery of this endpoint, for the status dot. */
  last: { status: WebhookDeliveryStatus; at: string } | null;
};
export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";
export type WebhookDeliveryView = {
  id: string;
  endpointId: string;
  endpointUrl: string;
  event: WebhookDeliveryEvent;
  status: WebhookDeliveryStatus;
  attempts: number;
  /** HTTP status of the last attempt, when the endpoint answered. */
  responseStatus: number | null;
  /** A short fixed phrase ("Timed out", "HTTP 500"), never the response body. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AdminWebhooks = {
  endpoints: WebhookEndpointView[];
  deliveries: WebhookDeliveryView[];
  /** Whether plain http and private addresses are accepted (local development only). */
  lenient: boolean;
};
