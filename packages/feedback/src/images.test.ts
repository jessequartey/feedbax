import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createConnectedStore } from "./connected";
import { createFeedbackModule } from "./index";
import { createImageModule } from "./images";
let runtime: Miniflare | undefined;
afterEach(async () => {
  const previous = runtime;
  runtime = undefined;
  await previous?.dispose();
});
const participant = { subject: "alice", displayName: "Alice" };
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2sAAAAASUVORK5CYII=",
    "base64",
  ),
);
async function setup() {
  runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"],
  });
  const database = await runtime.getD1Database("DB");
  for (const file of [
    "0001_connected.sql",
    "0002_participation.sql",
    "0003_images.sql",
  ])
    await database.exec(
      await readFile(
        `${existsSync("apps/portal/migrations") ? "apps/portal/migrations" : "migrations"}/${file}`,
        "utf8",
      ),
    );
  await createConnectedStore(database).acceptIdentity({
    ...participant,
    nonce: "a",
    sessionHash: "a",
    expiresAt: Date.now() + 60000,
  });
  const feedback = createFeedbackModule();
  return {
    database,
    bucket: await runtime.getR2Bucket("IMAGES"),
    feedback,
    reviewSecret: "s".repeat(32),
  };
}
it("keeps uploads private, binds images to an authorized draft, and never serves an unpublished image publicly", async () => {
  const options = await setup();
  const { feedback } = options;
  const owner = createImageModule({ ...options, participant });
  const uploaded = await owner.upload(png, "image/png");
  expect((await owner.read(uploaded.id))?.contentType).toBe("image/png");
  expect(await createImageModule(options).read(uploaded.id)).toBeUndefined();
  await expect(
    owner.upload(new TextEncoder().encode("<svg>bad</svg>"), "image/svg+xml"),
  ).rejects.toThrow("JPEG, PNG, or WebP");
  await expect(
    owner.upload(new Uint8Array(5 * 1024 * 1024 + 1), "image/png"),
  ).rejects.toThrow("5 MiB");
  const draft = await feedback.submitPost({
    title: "Image Post",
    description: "Description",
    type: "Feature Request",
  });
  await owner.attachPost({
    ids: [uploaded.id],
    id: draft.id,
    browserCapability: draft.browserCapability,
  });
  expect(await createImageModule(options).read(uploaded.id)).toBeUndefined();
  await expect(
    createImageModule({
      ...options,
      participant: { subject: "bob", displayName: "Bob" },
    }).attachPost({
      ids: [uploaded.id],
      id: draft.id,
      browserCapability: draft.browserCapability,
    }),
  ).rejects.toThrow("unavailable");
  const publicFeedback = createFeedbackModule({
    initialItems: [{ ...draft, published: true, status: "Planned" }],
  });
  const publicImages = createImageModule({
    ...options,
    feedback: publicFeedback,
  });
  expect(
    (await publicImages.forPost(draft.slug)).map((image) => image.id),
  ).toEqual([uploaded.id]);
  expect(await publicImages.read(uploaded.id)).toBeDefined();
  const review = await owner.reviewUrl(
    uploaded.id,
    "https://feedback.example.com",
  );
  expect(
    await createImageModule(options).read(
      uploaded.id,
      new URL(review).searchParams.get("review")!,
    ),
  ).toBeDefined();
  expect(
    await createImageModule(options).read(uploaded.id, "forged"),
  ).toBeUndefined();
  await feedback.withdrawDraftPost({
    id: draft.id,
    browserCapability: draft.browserCapability,
  });
  expect(await owner.read(uploaded.id)).toBeUndefined();
  expect(
    await createImageModule(options).read(
      uploaded.id,
      new URL(review).searchParams.get("review")!,
    ),
  ).toBeUndefined();
});

it("rejects attachment overflow without partial binding and cleans up a rolled-back image Post", async () => {
  const options = await setup();
  const owner = createImageModule({ ...options, participant });
  const ids = [];
  for (let i = 0; i < 5; i++)
    ids.push((await owner.upload(png, "image/png")).id);
  const draft = await options.feedback.submitPost({
    title: "Images",
    description: "Description",
    type: "Feature Request",
  });
  await owner.attachPost({
    ids: ids.slice(0, 3),
    id: draft.id,
    browserCapability: draft.browserCapability,
  });
  await expect(
    owner.attachPost({
      ids: ids.slice(3),
      id: draft.id,
      browserCapability: draft.browserCapability,
    }),
  ).rejects.toThrow("unavailable");
  expect(await owner.forPost(draft.slug)).toHaveLength(3);
  const { createImageFeedbackModule } = await import("./image-feedback");
  const { createNotionImageReviewWriter } =
    await import("./notion-image-review");
  const writer = createNotionImageReviewWriter({
    token: "private-notion-key",
    reviewUrl: (id) => owner.reviewUrl(id, "https://feedback.example.com"),
    request: async () => new Response("unavailable", { status: 500 }),
  });
  const feedback = createImageFeedbackModule(options.feedback, owner, writer);
  await expect(
    feedback.submitPost({
      title: "Failed review",
      description: "Description",
      type: "Feature Request",
      imageIds: [ids[3]!],
    }),
  ).rejects.toThrow("review links");
  expect(await owner.read(ids[3]!)).toBeUndefined();
  expect(await owner.cleanup()).toBe(1);
  expect(await owner.read(ids[3]!)).toBeUndefined();
});

it("removes public and creator access to images when their Comment is deleted", async () => {
  const options = await setup();
  const { createConnectedFeedbackModule } =
    await import("./connected-feedback");
  const { createImageFeedbackModule } = await import("./image-feedback");
  const base = createFeedbackModule({
    initialItems: [
      {
        id: "p",
        slug: "public",
        title: "Public",
        description: "Description",
        type: "Feature Request",
        status: "Planned",
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(1000),
      },
    ],
  });
  const connected = createConnectedFeedbackModule(
    base,
    createConnectedStore(options.database),
    participant,
  );
  const owner = createImageModule({
    ...options,
    feedback: connected,
    participant,
  });
  const image = await owner.upload(png, "image/png");
  const feedback = createImageFeedbackModule(connected, owner);
  const comment = await feedback.createComment({
    slug: "public",
    body: "Screenshot attached",
    displayName: "Spoofed",
    imageIds: [image.id],
  });
  expect(comment.images?.[0]?.id).toBe(image.id);
  expect(
    (await feedback.listCommentThreads({ slug: "public" })).items[0]
      ?.comments[0]?.images?.[0]?.id,
  ).toBe(image.id);
  expect(
    await createImageModule({ ...options, feedback: connected }).read(image.id),
  ).toBeDefined();
  await feedback.deleteComment({ commentId: comment.id });
  expect(await owner.read(image.id)).toBeUndefined();
  expect(
    await createImageModule({ ...options, feedback: connected }).read(image.id),
  ).toBeUndefined();
});
