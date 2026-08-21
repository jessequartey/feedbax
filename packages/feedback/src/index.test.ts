import { describe, expect, it } from "vitest";

import {
  createFeedbackModule,
  type BrowserCapability,
  type FeedbackStatus,
} from "./index";

describe("Feedback module", () => {
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

  it("returns the original Feedback Item for a repeated trusted submission", async () => {
    const feedback = createFeedbackModule();

    const first = await feedback.submitTrusted({
      externalId: "product-a:feedback-123",
      title: "Keyboard navigation",
      description: "Let users navigate the product without a mouse.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
    });
    const retried = await feedback.submitTrusted({
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
    const submittedItem = await feedback.submit({
      title: "Withdraw this draft",
      description: "I no longer want to submit this.",
      type: "General Feedback",
    });
    const wrongCapability =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as BrowserCapability;

    await expect(
      feedback.editDraft({
        id: submittedItem.id,
        browserCapability: wrongCapability,
        title: "Unauthorized edit",
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");
    await expect(
      feedback.withdrawDraft({
        id: submittedItem.id,
        browserCapability: wrongCapability,
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");

    await expect(
      feedback.withdrawDraft({
        id: submittedItem.id,
        browserCapability: submittedItem.browserCapability,
      }),
    ).resolves.toBeUndefined();
    await expect(
      feedback.editDraft({
        id: submittedItem.id,
        browserCapability: submittedItem.browserCapability,
        title: "Too late",
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");
  });

  it("returns a Browser Capability that edits the permitted fields of its draft", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submit({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitter: {
        name: "Ama",
        email: "ama@example.com",
      },
    });

    expect(submittedItem.browserCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const editedItem = await feedback.editDraft({
      id: submittedItem.id,
      browserCapability: submittedItem.browserCapability,
      title: "Corrected title",
      description: "Corrected description",
      type: "Bug Report",
      submitter: {
        name: "Amina",
        email: "amina@example.com",
      },
    });

    expect(editedItem).toMatchObject({
      id: submittedItem.id,
      title: "Corrected title",
      description: "Corrected description",
      type: "Bug Report",
      submitter: {
        name: "Amina",
        email: "amina@example.com",
      },
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
            title: "Protected title",
            description: "Protected description",
            type: "Feature Request",
            status: status satisfies FeedbackStatus,
            published,
            createdAt: new Date("2026-08-20T09:00:00.000Z"),
            updatedAt: new Date("2026-08-20T09:00:00.000Z"),
            browserCapabilityHash:
              "ZtNPunH49FD35FWYhT5Tv8I7vRKQJ8uxMaL0_9eHjNA",
          },
        ],
      });

      await expect(
        feedback.editDraft({
          id: "ineligible-item",
          browserCapability,
          title: "Unauthorized edit",
        }),
      ).rejects.toThrow("Browser Capability did not authorize this draft.");
      await expect(
        feedback.withdrawDraft({
          id: "ineligible-item",
          browserCapability,
        }),
      ).rejects.toThrow("Browser Capability did not authorize this draft.");
    },
  );

  it("edits optional submitter fields independently", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submit({
      title: "Keep in touch",
      description: "Contact me about this Feedback Item.",
      type: "General Feedback",
      submitter: {
        name: "Ama",
        email: "ama@example.com",
      },
    });

    const renamedItem = await feedback.editDraft({
      id: submittedItem.id,
      browserCapability: submittedItem.browserCapability,
      submitter: { name: "Amina" },
    });
    const readdressedItem = await feedback.editDraft({
      id: submittedItem.id,
      browserCapability: submittedItem.browserCapability,
      submitter: { email: "amina@example.com" },
    });

    expect(renamedItem.submitter).toEqual({
      name: "Amina",
      email: "ama@example.com",
    });
    expect(readdressedItem.submitter).toEqual({
      name: "Amina",
      email: "amina@example.com",
    });
  });

  it("returns the public roadmap grouped by status and ordered by most recent update", async () => {
    const createdAt = new Date("2026-08-01T09:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "planned-older",
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

    await expect(feedback.getPublicRoadmap()).resolves.toEqual({
      Planned: [
        {
          id: "planned-newer",
          title: "Newer planned item",
          description: "Planned second, updated later.",
          type: "Bug Report",
          status: "Planned",
          createdAt,
          updatedAt: new Date("2026-08-20T09:00:00.000Z"),
        },
        {
          id: "planned-older",
          title: "Older planned item",
          description: "Planned first, updated earlier.",
          type: "Feature Request",
          status: "Planned",
          createdAt,
          updatedAt: new Date("2026-08-18T09:00:00.000Z"),
        },
      ],
      "In Progress": [
        {
          id: "in-progress",
          title: "Active work",
          description: "Currently being implemented.",
          type: "General Feedback",
          status: "In Progress",
          createdAt,
          updatedAt: new Date("2026-08-19T09:00:00.000Z"),
        },
      ],
      Shipped: [
        {
          id: "shipped",
          title: "Delivered work",
          description: "Already available.",
          type: "Feature Request",
          status: "Shipped",
          createdAt,
          updatedAt: new Date("2026-08-17T09:00:00.000Z"),
        },
      ],
    });
  });

  it("returns the newest 25 Published Feedback Items in the first page", async () => {
    const feedback = createFeedbackModule({
      initialItems: Array.from({ length: 27 }, (_, index) => ({
        id: `feedback-${index + 1}`,
        title: `Feedback ${index + 1}`,
        description: `Description ${index + 1}`,
        type: "Feature Request" as const,
        status: "New" as const,
        published: true,
        createdAt: new Date(Date.UTC(2026, 7, index + 1)),
        updatedAt: new Date(Date.UTC(2026, 7, index + 1)),
      })),
    });

    const page = await feedback.listPublic();

    expect(page.items).toHaveLength(25);
    expect(page.items[0]?.title).toBe("Feedback 27");
    expect(page.items[24]?.title).toBe("Feedback 3");
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it("advances filtered cursor pages without duplicates, gaps, or private fields", async () => {
    const matchingItems = Array.from({ length: 30 }, (_, index) => ({
      id: `matching-${index + 1}`,
      title: `Matching ${index + 1}`,
      description: `Description ${index + 1}`,
      type: "Bug Report" as const,
      status: "Planned" as const,
      published: true,
      createdAt: new Date(Date.UTC(2026, 6, index + 1)),
      updatedAt: new Date(Date.UTC(2026, 6, index + 1)),
      submitter: { email: `private-${index + 1}@example.com` },
      browserCapabilityHash: `private-hash-${index + 1}`,
      source: "portal",
      pageBody: "Private notes",
      customProperty: "private value",
    }));
    const feedback = createFeedbackModule({
      initialItems: [
        ...matchingItems,
        {
          ...matchingItems[0]!,
          id: "wrong-type",
          title: "Wrong type",
          type: "Feature Request",
        },
        {
          ...matchingItems[1]!,
          id: "wrong-status",
          title: "Wrong status",
          status: "Shipped",
        },
      ],
    });

    const firstPage = await feedback.listPublic({
      type: "Bug Report",
      status: "Planned",
    });
    const secondPage = await feedback.listPublic({
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
      "id",
      "status",
      "title",
      "type",
      "updatedAt",
    ]);
  });

  it("submits a New, unpublished Feedback Item", async () => {
    const feedback = createFeedbackModule();

    const item = await feedback.submit({
      title: "Add keyboard shortcuts",
      description: "Let me navigate the portal without a mouse.",
      type: "Feature Request",
      submitter: {
        name: "Amina",
        email: "amina@example.com",
      },
    });

    expect(item).toMatchObject({
      title: "Add keyboard shortcuts",
      description: "Let me navigate the portal without a mouse.",
      type: "Feature Request",
      status: "New",
      published: false,
      submitter: {
        name: "Amina",
        email: "amina@example.com",
      },
    });
  });

  it("excludes unpublished Feedback Items from public retrieval", async () => {
    const feedback = createFeedbackModule();

    await feedback.submit({
      title: "Private draft",
      description: "This has not been approved for public display.",
      type: "General Feedback",
    });

    await expect(feedback.listPublic()).resolves.toEqual({ items: [] });
  });

  it("does not let a caller publish a submitted Feedback Item by mutation", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submit({
      title: "Private draft",
      description: "This has not been approved for public display.",
      type: "General Feedback",
    });

    submittedItem.published = true;

    await expect(feedback.listPublic()).resolves.toEqual({ items: [] });
  });

  it("returns only the approved public projection for a Published Feedback Item", async () => {
    const createdAt = new Date("2026-08-19T10:00:00.000Z");
    const updatedAt = new Date("2026-08-20T09:30:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "feedback-item-id",
          title: "Add keyboard shortcuts",
          description: "Let me navigate the portal without a mouse.",
          type: "Feature Request",
          status: "New",
          published: true,
          createdAt,
          updatedAt,
          submitter: {
            name: "Amina",
            email: "amina@example.com",
          },
          browserCapabilityHash: "secret-hash",
          source: "portal",
          pageBody: "Private notes from the Product Team",
          customProperty: "must not leak",
        },
      ],
    });

    await expect(feedback.listPublic()).resolves.toEqual({
      items: [
        {
          id: "feedback-item-id",
          title: "Add keyboard shortcuts",
          description: "Let me navigate the portal without a mouse.",
          type: "Feature Request",
          status: "New",
          createdAt,
          updatedAt,
        },
      ],
    });
  });
});
