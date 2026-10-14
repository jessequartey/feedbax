import { describe, expect, it, vi } from "vitest";
import { createFeedbaxClient } from "./feedbax-client.server";

describe("Feedbax server client", () => {
  it("keeps authentication and idempotency at the server seam", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ slug: "better-search", title: "Better search" }),
      );
    const client = createFeedbaxClient({
      apiBaseUrl: "https://feedback.example.com",
      apiSecret: "private",
      request,
    });
    await expect(
      client.submitFeedback(
        {
          title: "Better search",
          description: "Find results faster",
          type: "Feature Request",
        },
        { idempotencyKey: "product:123" },
      ),
    ).resolves.toEqual({ slug: "better-search", title: "Better search" });
    expect(request).toHaveBeenCalledWith(
      new URL("https://feedback.example.com/api/v1/posts"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer private",
          "Idempotency-Key": "product:123",
        }),
      }),
    );
  });

  it("rejects insecure non-local endpoints", () => {
    expect(() =>
      createFeedbaxClient({
        apiBaseUrl: "http://feedback.example.com",
        apiSecret: "private",
      }),
    ).toThrow("HTTPS");
  });
});
