import { describe, expect, it } from "vite-plus/test";
import { defineConfig } from "../../src/contracts/config.ts";
import { enforceReadAccess, privateResponse } from "../../src/server/read-access.ts";
const settings = { auth: { private: true }, appUrl: "https://app.example.com" };
describe("private board access", () => {
  it("gates every representation, including encoded paths, before serving content", async () => {
    for (const path of [
      "/",
      "/posts/a",
      "/roadmap",
      "/changelog",
      "/changelog.rss",
      "/api/media/a",
      "/api/og/a",
      "/_serverFn/search",
      "/%61pi/media/a",
    ]) {
      const request = new Request(`https://feedback.example.com${path}`);
      expect((await enforceReadAccess(request, settings, async () => null))?.status).toBe(401);
      expect(
        await enforceReadAccess(request, settings, async () => ({
          id: "u",
          name: "Ama",
          kind: "host",
        })),
      ).toBeNull();
      expect(
        (
          await enforceReadAccess(request, settings, async () => ({
            id: "u",
            name: "Ama",
            kind: "host",
            banned: true,
          }))
        )?.status,
      ).toBe(401);
    }
  });
  it("allows identity entry and independently authenticated submissions, but no GET posts shortcut", async () => {
    for (const [path, method] of [
      ["/api/auth/feedbax/sign-in", "GET"],
      ["/api/posts", "POST"],
      ["/api/posts", "OPTIONS"],
      ["/api/host/revoke", "POST"],
      ["/assets/app.js", "GET"],
    ])
      expect(
        await enforceReadAccess(
          new Request(`https://feedback.example.com${path}`, { method }),
          settings,
          async () => null,
        ),
      ).toBeNull();
    expect(
      (
        await enforceReadAccess(
          new Request("https://feedback.example.com/api/posts"),
          settings,
          async () => null,
        )
      )?.status,
    ).toBe(401);
    const response = privateResponse(
      new Response("private", { headers: { "Cache-Control": "public, max-age=3600" } }),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });
  it("needs an appUrl to sign in through and cannot also allow anonymous posting", () => {
    const notion = { dataSourceId: "12345678-1234-4234-8234-123456789abc" };
    const base = { integrations: { notion } };
    expect(
      defineConfig({ ...base, appUrl: "https://app.example.com", auth: { private: true } }).auth
        .private,
    ).toBe(true);
    expect(defineConfig(base).auth.private).toBeUndefined();
    expect(() => defineConfig({ ...base, auth: { private: true } })).toThrow(/requires appUrl/);
    expect(() =>
      defineConfig({
        ...base,
        appUrl: "https://app.example.com",
        auth: { private: true, anonymous: true },
      }),
    ).toThrow(/cannot be combined/);
  });
});
