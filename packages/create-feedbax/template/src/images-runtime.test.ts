import { expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createConnectedStore,
  createFeedbackModule,
  createImageModule,
} from "@feedbax/feedback";
import { createImageRequestHandler } from "./images-runtime";
import { readSessionToken, sessionHash } from "./connected-identity";
it("authenticates uploads, bounds image bodies, and serves private objects only through authorized no-store responses", async () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"],
  });
  try {
    const database = await runtime.getD1Database("DB");
    for (const name of [
      "0001_connected.sql",
      "0002_participation.sql",
      "0003_images.sql",
    ])
      await database.exec(
        await readFile(
          `${existsSync("apps/portal/migrations") ? "apps/portal/migrations" : "migrations"}/${name}`,
          "utf8",
        ),
      );
    const store = createConnectedStore(database);
    await store.acceptIdentity({
      subject: "alice",
      displayName: "Alice",
      nonce: "a",
      sessionHash: sessionHash("session"),
      expiresAt: Date.now() + 60000,
    });
    const participant = async (request: Request) => {
      const token = readSessionToken(request);
      return token ? store.session(sessionHash(token)) : undefined;
    };
    const bucket = await runtime.getR2Bucket("IMAGES");
    const feedback = createFeedbackModule();
    const handler = createImageRequestHandler({
      enabled: true,
      siteUrl: "https://feedback.example.com",
      signedIn: async (request) => Boolean(await participant(request)),
      getImages: async (request) =>
        createImageModule({
          database,
          bucket,
          feedback,
          participant: await participant(request),
          reviewSecret: "s".repeat(32),
        }),
      rateLimit: async () => true,
    });
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const headers = {
      Origin: "https://feedback.example.com",
      "Content-Type": "image/png",
      Cookie: "__Host-feedbax-session=session",
    };
    expect(
      (
        await handler(
          new Request("https://feedback.example.com/internal/images", {
            method: "POST",
            headers: { ...headers, Origin: "https://evil.example.com" },
            body: png,
          }),
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await handler(
          new Request("https://feedback.example.com/internal/images", {
            method: "POST",
            headers: { Origin: headers.Origin, "Content-Type": "image/png" },
            body: png,
          }),
        )
      )?.status,
    ).toBe(401);
    expect(
      (
        await handler(
          new Request("https://feedback.example.com/internal/images", {
            method: "POST",
            headers: {
              ...headers,
              "Content-Length": String(5 * 1024 * 1024 + 1),
            },
            body: png,
          }),
        )
      )?.status,
    ).toBe(413);
    const upload = await handler(
      new Request("https://feedback.example.com/internal/images", {
        method: "POST",
        headers,
        body: png,
      }),
    );
    expect(upload?.status).toBe(201);
    const image = JSON.parse(await upload!.text());
    const publicRead = await handler(
      new Request(`https://feedback.example.com${image.src}`),
    );
    expect(publicRead?.status).toBe(404);
    const ownRead = await handler(
      new Request(`https://feedback.example.com${image.src}`, {
        headers: { Cookie: headers.Cookie },
      }),
    );
    expect(ownRead?.status).toBe(200);
    expect(ownRead?.headers.get("Cache-Control")).toBe("no-store");
    expect(ownRead?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await ownRead!.arrayBuffer())).toEqual(png);
  } finally {
    await runtime.dispose();
  }
});
