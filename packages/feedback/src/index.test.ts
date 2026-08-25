import { describe, expect, it } from "vitest";

import {
  createFeedbackModule,
  type BrowserCapability,
  type PostStatus,
} from "./index";

describe("Feedback module", () => {
  it("adds and removes a Vote from the server-authoritative count on a Published Post", async () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "published-post",
          slug: "keyboard-navigation",
          title: "Keyboard navigation",
          description: "Navigate without a mouse.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          voteCount: 2,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      feedback.changeVote({ slug: "keyboard-navigation", intention: "add" }),
    ).resolves.toEqual({ slug: "keyboard-navigation", voteCount: 3 });
    await expect(
      feedback.changeVote({ slug: "keyboard-navigation", intention: "remove" }),
    ).resolves.toEqual({ slug: "keyboard-navigation", voteCount: 2 });
  });

  it("serializes concurrent Vote mutations for one Post within the module instance", async () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "post",
          slug: "post",
          title: "Post",
          description: "Visible.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          voteCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      Promise.all([
        feedback.changeVote({ slug: "post", intention: "add" }),
        feedback.changeVote({ slug: "post", intention: "add" }),
      ]),
    ).resolves.toEqual([
      { slug: "post", voteCount: 1 },
      { slug: "post", voteCount: 2 },
    ]);
  });

  it("rejects Votes for unpublished Posts and clamps removals at zero", async () => {
    const now = new Date("2026-08-21T10:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "published-post",
          slug: "published-post",
          title: "Published Post",
          description: "Visible.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          voteCount: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "draft-post",
          slug: "draft-post",
          title: "Draft Post",
          description: "Private.",
          type: "Feature Request",
          status: "New",
          published: false,
          voteCount: 4,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      feedback.changeVote({ slug: "published-post", intention: "remove" }),
    ).resolves.toEqual({ slug: "published-post", voteCount: 0 });
    await expect(
      feedback.changeVote({ slug: "draft-post", intention: "add" }),
    ).rejects.toThrow("Votes are available only for Published Posts.");
  });

  it("submits a Post with persisted public identity and private edit authority", async () => {
    const feedback = createFeedbackModule();

    const submitted = await feedback.submitPost({
      title: "Keyboard navigation",
      description: "Let Participants navigate without a mouse.",
      type: "Feature Request",
    });

    expect(submitted).toMatchObject({
      id: expect.any(String),
      slug: "keyboard-navigation",
      title: "Keyboard navigation",
      description: "Let Participants navigate without a mouse.",
      type: "Feature Request",
      status: "New",
      published: false,
      browserCapability: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(submitted).not.toHaveProperty("browserCapabilityHash");
  });

  it("suffixes duplicate Post slugs and keeps each slug immutable after title edits", async () => {
    const feedback = createFeedbackModule();
    const first = await feedback.submitPost({
      title: "Dark mode!",
      description: "Respect the device theme.",
      type: "Feature Request",
    });
    const second = await feedback.submitPost({
      title: "Dark mode",
      description: "Offer a theme preference.",
      type: "Feature Request",
    });

    const edited = await feedback.editDraftPost({
      id: first.id,
      browserCapability: first.browserCapability,
      title: "System theme",
    });

    expect([first.slug, second.slug]).toEqual(["dark-mode", "dark-mode-2"]);
    expect(edited).toMatchObject({
      id: first.id,
      slug: "dark-mode",
      title: "System theme",
    });
  });

  it("allocates distinct slugs for concurrent Post submissions", async () => {
    const feedback = createFeedbackModule();

    const [first, second] = await Promise.all([
      feedback.submitPost({
        title: "Dark mode",
        description: "Respect the device theme.",
        type: "Feature Request",
      }),
      feedback.submitPost({
        title: "Dark mode",
        description: "Offer a theme preference.",
        type: "Feature Request",
      }),
    ]);

    expect([first.slug, second.slug]).toEqual(["dark-mode", "dark-mode-2"]);
  });

  it("returns allowlisted public and authorized Draft Post projections without capabilities", async () => {
    const createdAt = new Date("2026-08-21T10:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "published-storage-id",
          slug: "keyboard-navigation",
          title: "Keyboard navigation",
          description: "Navigate without a mouse.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt,
          updatedAt: createdAt,
          submitter: { email: "private@example.com" },
          browserCapabilityHash: "private-hash",
          pageBody: "Private Product Team notes",
        },
      ],
    });
    const draft = await feedback.submitPost({
      title: "Dark mode",
      description: "Respect the device theme.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
    });

    const publicPost = await feedback.getPublicPost("keyboard-navigation");
    const draftPost = await feedback.getDraftPost({
      id: draft.id,
      browserCapability: draft.browserCapability,
    });

    expect(publicPost).toEqual({
      slug: "keyboard-navigation",
      title: "Keyboard navigation",
      description: "Navigate without a mouse.",
      type: "Feature Request",
      status: "Planned",
      createdAt,
      updatedAt: createdAt,
      voteCount: 0,
    });
    expect(draftPost).toMatchObject({
      id: draft.id,
      slug: "dark-mode",
      submitter: { name: "Ama", email: "ama@example.com" },
      status: "New",
    });
    expect(draftPost).not.toHaveProperty("browserCapability");
    expect(draftPost).not.toHaveProperty("browserCapabilityHash");
    expect(draftPost).not.toHaveProperty("pageBody");
  });

  it("returns the original Post for a repeated trusted submission", async () => {
    const feedback = createFeedbackModule();

    const first = await feedback.submitTrustedPost({
      externalId: "product-a:feedback-123",
      title: "Keyboard navigation",
      description: "Let users navigate the product without a mouse.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
    });
    const retried = await feedback.submitTrustedPost({
      externalId: "product-a:feedback-123",
      title: "A changed retry must not overwrite the original",
      description: "The first accepted request remains canonical.",
      type: "Bug Report",
    });

    expect(retried).toEqual(first);
    expect(retried).toMatchObject({
      title: "Keyboard navigation",
      description: "Let users navigate the product without a mouse.",
      type: "Feature Request",
      status: "New",
    });
    expect(retried).not.toHaveProperty("browserCapability");
    expect(retried).not.toHaveProperty("published");
    expect(retried).not.toHaveProperty("submitter");
  });

  it("lets only the correct Browser Capability withdraw its eligible draft", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submitPost({
      title: "Withdraw this draft",
      description: "I no longer want to submit this.",
      type: "General Feedback",
    });
    const wrongCapability =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as BrowserCapability;

    await expect(
      feedback.editDraftPost({
        id: submittedItem.id,
        browserCapability: wrongCapability,
        title: "Unauthorized edit",
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");
    await expect(
      feedback.withdrawDraftPost({
        id: submittedItem.id,
        browserCapability: wrongCapability,
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");

    await expect(
      feedback.withdrawDraftPost({
        id: submittedItem.id,
        browserCapability: submittedItem.browserCapability,
      }),
    ).resolves.toBeUndefined();
    await expect(
      feedback.editDraftPost({
        id: submittedItem.id,
        browserCapability: submittedItem.browserCapability,
        title: "Too late",
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");
  });

  it("returns a Browser Capability that edits the permitted fields of its draft", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submitPost({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitter: {
        name: "Ama",
        email: "ama@example.com",
      },
    });

    expect(submittedItem.browserCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const editedItem = await feedback.editDraftPost({
      id: submittedItem.id,
      browserCapability: submittedItem.browserCapability,
      title: "Corrected title",
      description: "Corrected description",
      type: "Bug Report",
    });

    expect(editedItem).toMatchObject({
      id: submittedItem.id,
      title: "Corrected title",
      description: "Corrected description",
      type: "Bug Report",
      submitter: { name: "Ama", email: "ama@example.com" },
      status: "New",
      published: false,
    });
    expect(editedItem).not.toHaveProperty("browserCapability");
    expect(editedItem).not.toHaveProperty("browserCapabilityHash");
  });

  it.each([
    { status: "New" as const, published: true },
    { status: "Reviewing" as const, published: false },
  ])(
    "does not edit a draft after its lifecycle eligibility ends: $status, published=$published",
    async ({ status, published }) => {
      const browserCapability =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as BrowserCapability;
      const feedback = createFeedbackModule({
        initialItems: [
          {
            id: "ineligible-item",
            slug: "ineligible-item",
            title: "Protected title",
            description: "Protected description",
            type: "Feature Request",
            status: status satisfies PostStatus,
            published,
            createdAt: new Date("2026-08-20T09:00:00.000Z"),
            updatedAt: new Date("2026-08-20T09:00:00.000Z"),
            voteCount: 0,
            browserCapabilityHash:
              "ZtNPunH49FD35FWYhT5Tv8I7vRKQJ8uxMaL0_9eHjNA",
          },
        ],
      });

      await expect(
        feedback.editDraftPost({
          id: "ineligible-item",
          browserCapability,
          title: "Unauthorized edit",
        }),
      ).rejects.toThrow("Browser Capability did not authorize this draft.");
      await expect(
        feedback.withdrawDraftPost({
          id: "ineligible-item",
          browserCapability,
        }),
      ).rejects.toThrow("Browser Capability did not authorize this draft.");
    },
  );

  it("returns the public roadmap grouped by status and ordered by most recent update", async () => {
    const createdAt = new Date("2026-08-01T09:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "planned-older",
          slug: "planned-older",
          title: "Older planned item",
          description: "Planned first, updated earlier.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt,
          updatedAt: new Date("2026-08-18T09:00:00.000Z"),
          submitter: { email: "private@example.com" },
          pageBody: "Private Product Team notes",
        },
        {
          id: "planned-newer",
          slug: "planned-newer",
          title: "Newer planned item",
          description: "Planned second, updated later.",
          type: "Bug Report",
          status: "Planned",
          published: true,
          createdAt,
          updatedAt: new Date("2026-08-20T09:00:00.000Z"),
        },
        {
          id: "in-progress",
          slug: "in-progress",
          title: "Active work",
          description: "Currently being implemented.",
          type: "General Feedback",
          status: "In Progress",
          published: true,
          createdAt,
          updatedAt: new Date("2026-08-19T09:00:00.000Z"),
        },
        {
          id: "shipped",
          slug: "shipped",
          title: "Delivered work",
          description: "Already available.",
          type: "Feature Request",
          status: "Shipped",
          published: true,
          createdAt,
          updatedAt: new Date("2026-08-17T09:00:00.000Z"),
        },
        {
          id: "unpublished",
          slug: "unpublished",
          title: "Private plan",
          description: "Not approved for public display.",
          type: "Feature Request",
          status: "Planned",
          published: false,
          createdAt,
          updatedAt: new Date("2026-08-21T09:00:00.000Z"),
        },
        {
          id: "outside-roadmap",
          slug: "outside-roadmap",
          title: "Still under review",
          description: "Not part of the roadmap contract.",
          type: "Feature Request",
          status: "Reviewing",
          published: true,
          createdAt,
          updatedAt: new Date("2026-08-22T09:00:00.000Z"),
        },
      ],
    });

    await expect(feedback.getPublicPostRoadmap()).resolves.toEqual({
      Planned: {
        items: [
          {
            slug: "planned-newer",
            title: "Newer planned item",
            description: "Planned second, updated later.",
            type: "Bug Report",
            status: "Planned",
            createdAt,
            updatedAt: new Date("2026-08-20T09:00:00.000Z"),
            voteCount: 0,
          },
          {
            slug: "planned-older",
            title: "Older planned item",
            description: "Planned first, updated earlier.",
            type: "Feature Request",
            status: "Planned",
            createdAt,
            updatedAt: new Date("2026-08-18T09:00:00.000Z"),
            voteCount: 0,
          },
        ],
        totalCount: 2,
      },
      "In Progress": {
        items: [
          {
            slug: "in-progress",
            title: "Active work",
            description: "Currently being implemented.",
            type: "General Feedback",
            status: "In Progress",
            createdAt,
            updatedAt: new Date("2026-08-19T09:00:00.000Z"),
            voteCount: 0,
          },
        ],
        totalCount: 1,
      },
      Shipped: {
        items: [
          {
            slug: "shipped",
            title: "Delivered work",
            description: "Already available.",
            type: "Feature Request",
            status: "Shipped",
            createdAt,
            updatedAt: new Date("2026-08-17T09:00:00.000Z"),
            voteCount: 0,
          },
        ],
        totalCount: 1,
      },
    });
  });

  it("pages each public roadmap status independently in groups of 25", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        ...Array.from({ length: 27 }, (_, index) => ({
          id: `planned-${index + 1}`,
          slug: `planned-${index + 1}`,
          title: `Planned ${index + 1}`,
          description: `Description ${index + 1}`,
          type: "Feature Request" as const,
          status: "Planned" as const,
          published: true,
          createdAt: new Date(Date.UTC(2026, 6, 1)),
          updatedAt: new Date(Date.UTC(2026, 6, index + 1)),
        })),
        {
          id: "shipped-1",
          slug: "shipped-1",
          title: "Shipped 1",
          description: "Already delivered.",
          type: "Bug Report" as const,
          status: "Shipped" as const,
          published: true,
          createdAt: new Date(Date.UTC(2026, 6, 1)),
          updatedAt: new Date(Date.UTC(2026, 6, 28)),
        },
      ],
    });

    const firstPage = await feedback.listPublicRoadmapPosts({
      status: "Planned",
    });
    const secondPage = await feedback.listPublicRoadmapPosts({
      status: "Planned",
      cursor: firstPage.nextCursor,
    });
    const roadmap = await feedback.getPublicPostRoadmap();

    expect(firstPage.items).toHaveLength(25);
    expect(firstPage.items[0]?.title).toBe("Planned 27");
    expect(firstPage.items[24]?.title).toBe("Planned 3");
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.totalCount).toBe(27);
    expect(secondPage.items.map((item) => item.title)).toEqual([
      "Planned 2",
      "Planned 1",
    ]);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(secondPage.totalCount).toBe(27);
    expect(roadmap.Planned).toEqual(firstPage);
    expect(roadmap.Shipped).toMatchObject({
      totalCount: 1,
      items: [{ title: "Shipped 1" }],
    });
  });

  it("returns the newest 25 Published Posts in the first page", async () => {
    const feedback = createFeedbackModule({
      initialItems: Array.from({ length: 27 }, (_, index) => ({
        id: `feedback-${index + 1}`,
        slug: `feedback-${index + 1}`,
        title: `Feedback ${index + 1}`,
        description: `Description ${index + 1}`,
        type: "Feature Request" as const,
        status: "New" as const,
        published: true,
        createdAt: new Date(Date.UTC(2026, 7, index + 1)),
        updatedAt: new Date(Date.UTC(2026, 7, index + 1)),
      })),
    });

    const page = await feedback.listPublicPosts();

    expect(page.items).toHaveLength(25);
    expect(page.items[0]?.title).toBe("Feedback 27");
    expect(page.items[24]?.title).toBe("Feedback 3");
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it("advances filtered cursor pages without duplicates, gaps, or private fields", async () => {
    const matchingItems = Array.from({ length: 30 }, (_, index) => ({
      id: `matching-${index + 1}`,
      slug: `matching-${index + 1}`,
      title: `Matching ${index + 1}`,
      description: `Description ${index + 1}`,
      type: "Bug Report" as const,
      status: "Planned" as const,
      published: true,
      createdAt: new Date(Date.UTC(2026, 6, index + 1)),
      updatedAt: new Date(Date.UTC(2026, 6, index + 1)),
      submitter: { email: `private-${index + 1}@example.com` },
      browserCapabilityHash: `private-hash-${index + 1}`,
      source: "Portal" as const,
      pageBody: "Private notes",
      customProperty: "private value",
    }));
    const feedback = createFeedbackModule({
      initialItems: [
        ...matchingItems,
        {
          ...matchingItems[0]!,
          id: "wrong-type",
          slug: "wrong-type",
          title: "Wrong type",
          type: "Feature Request",
        },
        {
          ...matchingItems[1]!,
          id: "wrong-status",
          slug: "wrong-status",
          title: "Wrong status",
          status: "Shipped",
        },
      ],
    });

    const firstPage = await feedback.listPublicPosts({
      type: "Bug Report",
      status: "Planned",
    });
    const secondPage = await feedback.listPublicPosts({
      type: "Bug Report",
      status: "Planned",
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.items.map((item) => item.title)).toEqual(
      Array.from({ length: 25 }, (_, index) => `Matching ${30 - index}`),
    );
    expect(secondPage.items.map((item) => item.title)).toEqual([
      "Matching 5",
      "Matching 4",
      "Matching 3",
      "Matching 2",
      "Matching 1",
    ]);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(Object.keys(secondPage.items[0]!).sort()).toEqual([
      "createdAt",
      "description",
      "slug",
      "status",
      "title",
      "type",
      "updatedAt",
      "voteCount",
    ]);
  });

  it("composes Post search, multi-select filters, and sorting", async () => {
    const base = {
      status: "Planned" as const,
      published: true,
      createdAt: new Date("2026-08-22T10:00:00.000Z"),
      updatedAt: new Date("2026-08-22T10:00:00.000Z"),
    };
    const feedback = createFeedbackModule({
      initialItems: [
        {
          ...base,
          id: "matching-description",
          slug: "matching-description",
          title: "Keyboard navigation",
          description: "Reveal search without using a pointer.",
          type: "Feature Request",
        },
        {
          ...base,
          id: "matching-title",
          slug: "matching-title",
          title: "Faster search",
          description: "Find Posts by title.",
          type: "Bug Report",
        },
        {
          ...base,
          id: "wrong-status",
          slug: "wrong-status",
          title: "Search closed Posts",
          description: "This should not match.",
          type: "Bug Report",
          status: "Closed",
        },
      ],
    });

    const trending = await feedback.listPublicPosts({
      search: "search",
      types: ["Feature Request", "Bug Report"],
      statuses: ["Planned"],
      sort: "trending",
    });

    expect(trending.items.map((post) => post.slug).sort()).toEqual([
      "matching-description",
      "matching-title",
    ]);
  });
});
