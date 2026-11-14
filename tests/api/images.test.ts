import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv, flushWaitUntil, queue } from "../fixtures/cloudflare-workers.ts";
import { form, png, writer } from "./helpers.ts";
import { createPostForUser, getPostDetail } from "../../src/server/posts.ts";
import { serveImage, validateImage } from "../../src/server/images.ts";

beforeEach(resetEnv);
it("stores an attachment in private R2 and serves only attached image IDs with safe cache headers", async () => {
  const user = await writer(),
    data = form(),
    id = data.get("id") as string;
  data.append("image", png());
  await createPostForUser(data, user);
  const post = await getPostDetail(id, user);
  expect(post.images).toHaveLength(1);
  expect(post.images[0]).toMatchObject({ width: 1, height: 1 });
  const object = await env.IMAGES.head(`posts/${id}/0`);
  expect(object?.size).toBe(png().size);
  const response = await serveImage(
    new Request(`${env.PORTAL_URL}${post.images[0].url}`),
    post.images[0].id,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array(await png().arrayBuffer()),
  );
  expect(
    (
      await serveImage(
        new Request(env.PORTAL_URL, {
          headers: { "if-none-match": response.headers.get("etag")! },
        }),
        post.images[0].id,
      )
    ).status,
  ).toBe(304);
  expect((await serveImage(new Request(env.PORTAL_URL), crypto.randomUUID())).status).toBe(404);
});
it.each([
  ["SVG", () => new File(["<svg></svg>"], "x.svg", { type: "image/svg+xml" }), "unsupported_image"],
  [
    "HTML disguised as PNG",
    () => new File(["<html>bad</html>"], "x.png", { type: "image/png" }),
    "unsupported_image",
  ],
  [
    "MIME mismatch",
    async () => new File([await png().arrayBuffer()], "x.jpg", { type: "image/jpeg" }),
    "unsupported_image",
  ],
  [
    "truncated PNG",
    async () =>
      new File([(await png().arrayBuffer()).slice(0, 24)], "x.png", { type: "image/png" }),
    "unsupported_image",
  ],
  [
    "over 5 MiB",
    () => new File([new Uint8Array(5242881)], "x.png", { type: "image/png" }),
    "too_large",
  ],
  [
    "side over 4096",
    async () => {
      const bytes = await png().arrayBuffer();
      new DataView(bytes).setUint32(16, 4097);
      return new File([bytes], "x.png", { type: "image/png" });
    },
    "too_large",
  ],
  [
    "over 16 MP",
    async () => {
      const bytes = await png().arrayBuffer();
      new DataView(bytes).setUint32(16, 4096);
      new DataView(bytes).setUint32(20, 4096);
      return new File([bytes], "x.png", { type: "image/png" });
    },
    "too_large",
  ],
])("rejects %s before writing R2", async (_label, make, code) => {
  const data = form();
  data.append("image", await make());
  await expect(createPostForUser(data, await writer())).rejects.toMatchObject({ code });
  expect((await env.IMAGES.list()).objects).toHaveLength(0);
});
it("rejects more than three images", async () => {
  const data = form();
  for (let i = 0; i < 4; i++) data.append("image", png());
  await expect(createPostForUser(data, await writer())).rejects.toMatchObject({
    code: "too_large",
  });
});
it("recovers from D1 failure after upload; unattached bytes cannot be served", async () => {
  const user = await writer(),
    data = form(),
    id = data.get("id") as string;
  data.append("image", png());
  await env.DB.prepare(
    "CREATE TRIGGER fail_insert BEFORE INSERT ON images BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
  ).run();
  try {
    await expect(createPostForUser(data, user)).rejects.toThrow();
  } finally {
    await env.DB.prepare("DROP TRIGGER fail_insert").run();
  }
  expect(await env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(id).first()).toBeNull();
  const orphan = await env.IMAGES.head(`posts/${id}/0`);
  expect(orphan).not.toBeNull();
  expect(
    (await serveImage(new Request(env.PORTAL_URL), orphan!.customMetadata!.imageId)).status,
  ).toBe(404);
  await createPostForUser(data, user);
  expect((await getPostDetail(id, user)).images).toHaveLength(1);
});
it("queue failure does not fail the committed post", async () => {
  queue.failNext();
  const user = await writer(),
    data = form();
  expect((await createPostForUser(data, user)).status).toBe(201);
  await flushWaitUntil();
  expect(await getPostDetail(data.get("id") as string, user)).toMatchObject({
    title: "Useful feature",
  });
});
it("concurrent attachments remain consistent and another author cannot replace them", async () => {
  const user = await writer(),
    data = form(),
    id = data.get("id") as string;
  data.append("image", png());
  const responses = await Promise.all([
    createPostForUser(data, user),
    createPostForUser(data, user),
  ]);
  expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 201]);
  const post = await getPostDetail(id, user);
  expect(post.images).toHaveLength(1);
  const object = await env.IMAGES.head(`posts/${id}/0`);
  expect(object?.customMetadata?.imageId).toBe(post.images[0].id);
  await expect(createPostForUser(data, await writer())).rejects.toMatchObject({ code: "conflict" });
});
it("recognizes complete JPEG and WebP containers and rejects truncation", async () => {
  // Small fixtures generated independently by Pillow (not the validator).
  const fixtures = [
    [
      "image/jpeg",
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==",
    ],
    ["image/webp", "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA="],
  ];
  for (const [mime, base64] of fixtures) {
    const bytes = Buffer.from(base64, "base64");
    expect(await validateImage(new File([bytes], "fixture", { type: mime }))).toMatchObject({
      mime,
      width: 1,
      height: 1,
    });
    await expect(
      validateImage(new File([bytes.subarray(0, -3)], "truncated", { type: mime })),
    ).rejects.toMatchObject({ code: "unsupported_image" });
  }
});
