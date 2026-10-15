import { expect, it } from "vitest";
import { createFeedbackModule } from "@feedbax/feedback";
import {
  createChangelogModule,
  createInMemoryChangelogStorage,
} from "@feedbax/changelog";
import { createPublicReleaseFeedbackModule } from "./public-release-links";

it("links only published local Changelog Entries or safe explicit external release notes", async () => {
  const entry = {
    id: "entry",
    slug: "released-export",
    title: "Export",
    summary: "Public",
    body: "Public",
    date: "2026-10-15" as const,
    labels: [],
    images: [],
    published: true,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  };
  const changelog = createChangelogModule({
    storage: createInMemoryChangelogStorage([
      entry,
      { ...entry, id: "draft", slug: "private-release", published: false },
    ]),
  });
  const post = {
    id: "p",
    slug: "export",
    title: "Export",
    description: "Public",
    type: "Feature Request" as const,
    status: "Shipped" as const,
    published: true,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  };
  const module = (url: string) =>
    createPublicReleaseFeedbackModule({
      feedback: createFeedbackModule({
        initialItems: [{ ...post, releaseNotesUrl: url }],
      }),
      siteUrl: "https://portal.example",
      changelog,
    });
  expect(
    (await module("/changelog#released-export").getPublicPost(post.slug))
      ?.releaseNotesUrl,
  ).toBe("/changelog#released-export");
  for (const url of [
    "/changelog#private-release",
    "/internal/private",
    "//evil.example",
    "https://user:password@release.example",
    "javascript:alert(1)",
    "https://portal.example/changelog#private-release",
    "https://github.com/private-team/private-repo/issues/1",
    "https://github.com/private-team/private-repo/pull/2",
    "https://github.com/private-team/private-repo/%69ssues/1",
    "https://github.com./private-team/private-repo/issues/1",
  ])
    expect(
      (await module(url).getPublicPost(post.slug))?.releaseNotesUrl,
    ).toBeUndefined();
  expect(
    (
      await module("https://example.com/releases/export").getPublicPost(
        post.slug,
      )
    )?.releaseNotesUrl,
  ).toBe("https://example.com/releases/export");
  expect(
    (await module("/changelog#private-release").listPublicPosts()).items[0]
      ?.releaseNotesUrl,
  ).toBeUndefined();
});

it("checks current public visibility before exposing a GitHub release URL", async () => {
  const post = {
    id: "p",
    slug: "export",
    title: "Export",
    description: "Public",
    type: "Feature Request" as const,
    status: "Shipped" as const,
    published: true,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  };
  const module = (owner: string) =>
    createPublicReleaseFeedbackModule({
      feedback: createFeedbackModule({
        initialItems: [
          {
            ...post,
            releaseNotesUrl: `https://github.com/${owner}/feedback/releases/tag/v1`,
          },
        ],
      }),
      siteUrl: "https://portal.example",
      request: async (input, init) => {
        expect(String(input)).toBe(
          `https://api.github.com/repos/${owner}/feedback`,
        );
        expect(init?.redirect).toBe("manual");
        expect(new Headers(init?.headers).has("Authorization")).toBe(false);
        return owner === "public-team"
          ? Response.json({ id: 123, private: false })
          : new Response(null, { status: 404 });
      },
    });
  expect(
    (await module("public-team").getPublicPost(post.slug))?.releaseNotesUrl,
  ).toBe("https://github.com/public-team/feedback/releases/tag/v1");
  expect(
    (await module("private-team").getPublicPost(post.slug))?.releaseNotesUrl,
  ).toBeUndefined();
});
