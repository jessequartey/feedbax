import { afterEach, expect, it, vi } from "vite-plus/test";
import { EmailError, sendBatch, type OutgoingEmail } from "../../src/email/resend.ts";

const email: OutgoingEmail = {
  from: "Feedbax <fake@example.com>",
  to: "recipient@example.com",
  subject: "Update",
  html: "<p>Update</p>",
  text: "Update",
  headers: {},
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [429, true],
  [500, true],
  [503, true],
  [400, false],
  [401, false],
  [403, false],
  [422, false],
])("classifies HTTP %s without retaining provider text", async (status, transient) => {
  const fetcher = vi.fn(async () =>
    Response.json({ message: "secret recipient@example.com" }, { status }),
  );
  await expect(sendBatch("re_test_fake", [email], "stable-key", fetcher)).rejects.toMatchObject({
    status,
    transient,
    code: `http_${status}`,
  });
  const error = await sendBatch("re_test_fake", [email], "stable-key", fetcher).catch(
    (error: unknown) => error,
  );
  expect(JSON.stringify(error)).not.toMatch(/secret|recipient@example/);
});

it("retries concurrent requests under the same key and honors Retry-After", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { name: "concurrent_idempotent_requests" },
      { status: 409, headers: { "retry-after": "123" } },
    ),
  );
  await expect(sendBatch("re_test_fake", [email], "stable-key", fetcher)).rejects.toMatchObject({
    status: 409,
    transient: true,
    retryAfterSeconds: 123,
  });
});

it("a conflicting payload is permanent and network failure is transient", async () => {
  await expect(
    sendBatch("re_test_fake", [email], "stable-key", async () =>
      Response.json({ name: "invalid_idempotent_request" }, { status: 409 }),
    ),
  ).rejects.toMatchObject({ status: 409, transient: false });
  await expect(
    sendBatch("re_test_fake", [email], "stable-key", async () => {
      throw new TypeError("network secret");
    }),
  ).rejects.toEqual(new EmailError(null, true));
});
