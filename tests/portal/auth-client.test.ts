import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { authClient } from "../../src/lib/auth-client.ts";

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("authClient", () => {
  it("posts credentials as JSON to the Better Auth endpoints, same origin", async () => {
    const fetchMock = stubFetch(200, { token: "t" });
    const result = await authClient.signIn.email({ email: "a@b.co", password: "pw" });
    expect(result.error).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.co", password: "pw" });
  });

  it("uses the sign-up, anonymous and sign-out endpoints", async () => {
    const fetchMock = stubFetch(200, {});
    await authClient.signUp.email({ name: "Ada", email: "a@b.co", password: "x".repeat(12) });
    await authClient.signIn.anonymous();
    await authClient.signOut();
    expect(fetchMock.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/anonymous",
      "/api/auth/sign-out",
    ]);
  });

  it("returns the server's message on failure", async () => {
    stubFetch(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    const result = await authClient.signIn.email({ email: "a@b.co", password: "bad" });
    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const result = await authClient.signIn.anonymous();
    expect(result.error?.status).toBe(0);
  });
});
