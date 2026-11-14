import { expect, it, vi } from "vite-plus/test";
import { result } from "../../src/server/errors.ts";
import { errorResponse } from "../../src/server/http.ts";
it("unexpected catch boundaries emit one structured safe diagnostic and generic client errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const secret = "SENTINEL_SECRET_SQL_BINDING_SSO_URL";
    const response = await result(async () => {
      throw new Error(secret);
    }, "posts.create");
    expect(response).toEqual({
      ok: false,
      error: { code: "unavailable", message: "Please try again shortly." },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatchObject({
      operation: "posts.create",
      classification: "unexpected",
      correlationId: expect.any(String),
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    log.mockClear();
    const http = errorResponse(new TypeError(secret), "auth.request");
    expect(http.status).toBe(503);
    expect(await http.text()).not.toContain(secret);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  } finally {
    log.mockRestore();
  }
});
it("redacts a real storage failure inside post creation, including its request body", async () => {
  const { env } = await import("cloudflare:workers");
  const { resetEnv } = await import("../fixtures/cloudflare-workers.ts");
  const { writer, form } = await import("./helpers.ts");
  const { createPostForUser } = await import("../../src/server/posts.ts");
  await resetEnv();
  const user = await writer(),
    input = form();
  input.set("body", "BODY_SENTINEL_DO_NOT_LOG");
  const original = env.DB;
  env.DB = {
    prepare: () => {
      throw new Error("STORAGE_SENTINEL_SQL token=https://secret.example/sso");
    },
  } as unknown as D1Database;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await result(() => createPostForUser(input, user), "posts.create");
    expect(response).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SENTINEL|secret.example|token=/);
  } finally {
    env.DB = original;
    log.mockRestore();
  }
});
