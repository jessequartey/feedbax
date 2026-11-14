import { beforeEach, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
// Model the framework boundary: it buffers before dispatching the application function.
const downstream = vi.hoisted(() =>
  vi.fn(async (request: Request) => {
    await request.arrayBuffer();
    return new Response("framework reached");
  }),
);
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: downstream } }));
import worker from "../../src/server.ts";
beforeEach(async () => {
  await resetEnv();
  downstream.mockClear();
});
function streamed(type: string, size: number, headers: Record<string, string> = {}) {
  let remaining = size;
  return new Request(`${env.PORTAL_URL}/_serverFn/createPost`, {
    method: "POST",
    headers: { origin: env.PORTAL_URL, "content-type": type, ...headers },
    body: new ReadableStream({
      pull(controller) {
        if (remaining <= 0) return controller.close();
        const amount = Math.min(remaining, 65536);
        remaining -= amount;
        controller.enqueue(new Uint8Array(amount));
      },
    }),
    duplex: "half",
  } as RequestInit);
}
it.each([undefined, "1"])(
  "bounds chunked multipart before Start parses it (length %s)",
  async (length) => {
    const response = await worker.fetch(
      streamed(
        "multipart/form-data; boundary=x",
        16 * 1024 * 1024,
        length ? { "content-length": length } : {},
      ),
    );
    expect(response.status).toBe(413);
    expect(downstream).not.toHaveBeenCalled();
  },
);
it("bounds JSON with forged length and unexpected transport headers", async () => {
  expect(
    (
      await worker.fetch(
        streamed("application/json", 300000, { "content-length": "1", "x-tsr-serverfn": "true" }),
      )
    ).status,
  ).toBe(413);
  expect(downstream).not.toHaveBeenCalled();
});
it.each([
  { origin: "https://sibling.example.com", "sec-fetch-site": "same-site" },
  { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  { origin: "", "sec-fetch-site": "same-origin" },
])("rejects cookie RPC mutations from %j before framework parsing", async (headers) => {
  expect(
    (
      await worker.fetch(
        streamed("application/json", 10, {
          cookie: "better-auth.session_token=session",
          ...headers,
        }),
      )
    ).status,
  ).toBe(403);
  expect(downstream).not.toHaveBeenCalled();
});
it("permits legitimate portal RPC and leaves cross-origin bearer routing intact", async () => {
  expect((await worker.fetch(streamed("application/json", 10))).status).toBe(200);
  const request = new Request(`${env.PORTAL_URL}/api/posts`, {
    method: "POST",
    headers: { origin: "https://app.example.com", authorization: "Bearer token" },
    body: "test",
  });
  expect((await worker.fetch(request)).status).toBe(200);
  expect(downstream).toHaveBeenCalledTimes(2);
});
