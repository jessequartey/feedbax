import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { authClient } from "../../src/lib/auth-client.ts";

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("authClient", () => {
  it("exposes only social, anonymous and sign-out methods", async () => {
    expect(Object.keys(authClient).sort()).toEqual(["signIn", "signOut"]);
    expect(Object.keys(authClient.signIn).sort()).toEqual(["anonymous", "social"]);
    const fetchMock = stubFetch(200, {});
    await authClient.signIn.anonymous();
    await authClient.signOut();
    expect(fetchMock.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "/api/auth/sign-in/anonymous",
      "/api/auth/sign-out",
    ]);
  });
  it("returns the server's message on failure", async () => {
    stubFetch(401, { code: "DENIED", message: "Sign in denied" });
    expect((await authClient.signIn.anonymous()).error).toEqual({
      status: 401,
      code: "DENIED",
      message: "Sign in denied",
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
