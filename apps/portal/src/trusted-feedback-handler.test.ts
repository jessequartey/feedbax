import {
  createFeedbackModule,
  createNotionFeedbackModule,
  type FeedbackPropertyIds,
} from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import { createTrustedFeedbackHandler } from "./trusted-feedback-handler";
import { createPortalServerEntry } from "./portal-server-entry";

const propertyIds: FeedbackPropertyIds = {
  title: "title-id",
  description: "description-id",
  type: "type-id",
  status: "status-id",
  published: "published-id",
  submitterName: "submitter-name-id",
  submitterEmail: "submitter-email-id",
  source: "source-id",
  externalId: "external-id",
  editTokenHash: "edit-token-hash-id",
  createdAt: "created-at-id",
  updatedAt: "updated-at-id",
};

describe("trusted feedback Worker handler", () => {
  it("redirects equivalent public filter URLs to one canonical cache identity", async () => {
    const applicationHandler = vi.fn(async () => new Response("public"));
    const server = createPortalServerEntry({
      trustedFeedbackHandler: vi.fn(),
      applicationHandler,
    });

    const response = await server.fetch(
      new Request(
        "https://feedback.example.com/?type=Bug%20Report&status=New&ignored=value",
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://feedback.example.com/?status=New&type=Bug+Report&pageSize=25&sort=created-at-desc&schema=1",
    );
    expect(applicationHandler).not.toHaveBeenCalled();
  });

  it("serves minimal deployment health without invoking application handlers", async () => {
    const server = createPortalServerEntry({
      trustedFeedbackHandler: async () => {
        throw new Error("Health dispatch reached the trusted handler.");
      },
    });

    const response = await server.fetch(
      new Request("https://feedback.example.com/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("serves the trusted POST contract through the production server-entry dispatch", async () => {
    const server = createPortalServerEntry({
      trustedFeedbackHandler: createTrustedFeedbackHandler({
        ...trustedHandlerSecurity("correct-api-key"),
        feedback: createFeedbackModule(),
      }),
    });

    const response = await server.fetch(
      trustedRequest({}, "product-a:feedback-123"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      title: "Keyboard navigation",
      description: "Let users navigate without a mouse.",
      type: "Feature Request",
      status: "New",
    });
    expect(body).not.toHaveProperty("published");
  });

  it("rejects missing and invalid Bearer keys before any Notion request", async () => {
    const notionRequest = vi.fn<typeof fetch>();
    const handler = createTrustedFeedbackHandler({
      ...trustedHandlerSecurity("correct-api-key"),
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
    });
    const body = JSON.stringify({
      title: "Keyboard navigation",
      description: "Let users navigate without a mouse.",
      type: "Feature Request",
    });

    const missing = await handler(
      new Request("https://feedback.example.com/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    );
    const invalid = await handler(
      new Request("https://feedback.example.com/api/v1/feedback", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-api-key",
          "Content-Type": "application/json",
        },
        body,
      }),
    );

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({
      error: "Unauthorized trusted submission.",
    });
    await expect(invalid.json()).resolves.toEqual({
      error: "Unauthorized trusted submission.",
    });
    expect(notionRequest).not.toHaveBeenCalled();
  });

  it("requires and honors Idempotency-Key by returning the original Feedback Item", async () => {
    const page = notionPage({
      title: "Keyboard navigation",
      description: "Let users navigate without a mouse.",
      type: "Feature Request",
      externalId: "product-a:feedback-123",
    });
    const notionRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ results: [], has_more: false, next_cursor: null }),
      )
      .mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(
        Response.json({ results: [page], has_more: false, next_cursor: null }),
      );
    const handler = createTrustedFeedbackHandler({
      ...trustedHandlerSecurity("correct-api-key"),
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
    });

    const missingKey = await handler(trustedRequest({}));
    const first = await handler(trustedRequest({}, "product-a:feedback-123"));
    const retried = await handler(
      trustedRequest(
        {
          title: "A changed retry must not overwrite the original",
          type: "Bug Report",
        },
        "product-a:feedback-123",
      ),
    );

    expect(missingKey.status).toBe(400);
    await expect(missingKey.json()).resolves.toEqual({
      error: "Idempotency-Key header is required.",
    });
    expect(first.status).toBe(200);
    expect(retried.status).toBe(200);
    const firstBody = await first.json();
    const retriedBody = await retried.json();
    expect(retriedBody).toEqual(firstBody);
    expect(firstBody).not.toHaveProperty("published");
    expect(firstBody).not.toHaveProperty("submitter");
    expect(notionRequest).toHaveBeenCalledTimes(3);
    expect(
      notionRequest.mock.calls.filter(([url]) =>
        String(url).endsWith("/pages"),
      ),
    ).toHaveLength(1);
    const [lookupUrl, lookupInit] = notionRequest.mock.calls[0]!;
    expect(String(lookupUrl)).toBe(
      "https://api.notion.com/v1/data_sources/feedback-data-source/query",
    );
    expect(JSON.parse(String(lookupInit?.body))).toEqual({
      page_size: 1,
      filter: {
        property: "external-id",
        rich_text: { equals: "product-a:feedback-123" },
      },
    });
    const createInit = notionRequest.mock.calls[1]?.[1];
    const createBody = JSON.parse(String(createInit?.body)) as {
      properties: Record<string, unknown>;
    };
    expect(createBody.properties).toMatchObject({
      "source-id": { select: { name: "API" } },
      "external-id": {
        rich_text: [
          {
            type: "text",
            text: { content: "product-a:feedback-123" },
          },
        ],
      },
      "edit-token-hash-id": { rich_text: [] },
    });
  });

  it("rejects out-of-bounds trusted input before any Notion request", async () => {
    const notionRequest = vi.fn<typeof fetch>();
    const handler = createTrustedFeedbackHandler({
      ...trustedHandlerSecurity("correct-api-key"),
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
    });
    const requests = [
      trustedRequest({ title: "" }, "valid-key"),
      trustedRequest({ title: "t".repeat(161) }, "valid-key"),
      trustedRequest({ description: "" }, "valid-key"),
      trustedRequest({ description: "d".repeat(5_001) }, "valid-key"),
      trustedRequest({ submitter: { name: "n".repeat(201) } }, "valid-key"),
      trustedRequest({ submitter: { email: "e".repeat(321) } }, "valid-key"),
      trustedRequest({}, "k".repeat(201)),
      trustedRequest({ ignored: "x".repeat(20_000) }, "valid-key"),
    ];

    const responses = await Promise.all(requests.map(handler));

    expect(responses.map(({ status }) => status)).toEqual(
      Array(requests.length).fill(400),
    );
    for (const response of responses) {
      await expect(response.json()).resolves.toEqual({
        error: "Trusted submission exceeds an accepted bound.",
      });
    }
    expect(notionRequest).not.toHaveBeenCalled();
  });

  it("does not log or serialize API keys and private submission fields on failure", async () => {
    const notionRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { object: "error", message: "private Notion diagnostic" },
          { status: 500 },
        ),
      );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = createTrustedFeedbackHandler({
      ...trustedHandlerSecurity("plaintext-api-key"),
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
    });
    const request = new Request(
      "https://feedback.example.com/api/v1/feedback",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer plaintext-api-key",
          "Content-Type": "application/json",
          "Idempotency-Key": "private-external-id",
        },
        body: JSON.stringify({
          title: "private title",
          description: "private description",
          type: "General Feedback",
          submitter: { email: "private@example.com" },
        }),
      },
    );

    const response = await handler(request);
    const serialized = await response.text();

    expect(response.status).toBe(502);
    expect(serialized).toBe('{"error":"Trusted submission failed."}');
    expect(serialized).not.toContain("plaintext-api-key");
    expect(serialized).not.toContain("private title");
    expect(serialized).not.toContain("private@example.com");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it("rate-limits by API-key hash before any Notion request", async () => {
    const notionRequest = vi.fn<typeof fetch>();
    const rateLimiter = {
      limit: vi.fn().mockResolvedValue({ success: false }),
    };
    const apiKeyHash = hashApiKey("correct-api-key");
    const handler = createTrustedFeedbackHandler({
      apiKeyHash,
      rateLimiter,
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
    });

    const response = await handler(trustedRequest({}, "valid-key"));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Trusted submission rate limit exceeded.",
    });
    expect(rateLimiter.limit).toHaveBeenCalledWith({ key: apiKeyHash });
    expect(rateLimiter.limit).not.toHaveBeenCalledWith({
      key: "correct-api-key",
    });
    expect(notionRequest).not.toHaveBeenCalled();
  });
});

function trustedHandlerSecurity(apiKey: string) {
  return {
    apiKeyHash: hashApiKey(apiKey),
    rateLimiter: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
  };
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("base64url");
}

function trustedRequest(
  overrides: Record<string, unknown>,
  idempotencyKey?: string,
): Request {
  return new Request("https://feedback.example.com/api/v1/feedback", {
    method: "POST",
    headers: {
      Authorization: "Bearer correct-api-key",
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      title: "Keyboard navigation",
      description: "Let users navigate without a mouse.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
      ...overrides,
    }),
  });
}

function notionPage({
  title,
  description,
  type,
  externalId,
}: {
  title: string;
  description: string;
  type: "Feature Request" | "Bug Report" | "General Feedback";
  externalId: string;
}) {
  return {
    object: "page",
    id: "notion-page-id",
    created_time: "2026-08-20T13:00:00.000Z",
    last_edited_time: "2026-08-20T13:00:00.000Z",
    properties: {
      Title: { id: "title-id", title: [{ plain_text: title }] },
      Description: {
        id: "description-id",
        rich_text: [{ plain_text: description }],
      },
      Type: { id: "type-id", select: { name: type } },
      Status: { id: "status-id", select: { name: "New" } },
      Published: { id: "published-id", checkbox: false },
      "Submitter Name": {
        id: "submitter-name-id",
        rich_text: [{ plain_text: "Ama" }],
      },
      "Submitter Email": {
        id: "submitter-email-id",
        email: "ama@example.com",
      },
      Source: { id: "source-id", select: { name: "API" } },
      "External ID": {
        id: "external-id",
        rich_text: [{ plain_text: externalId }],
      },
      "Edit Token Hash": { id: "edit-token-hash-id", rich_text: [] },
    },
  };
}
import { createHash } from "node:crypto";
