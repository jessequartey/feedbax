import { describe, expect, it } from "vitest";

import { createFeedbackModule } from "./index";

describe("Feedback module", () => {
  it("returns a Browser Capability that edits the permitted fields of its draft", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submit({
      title: "Orignal title",
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
          title: "Newer planned item",
          description: "Planned second, updated later.",
          type: "Bug Report",
          status: "Planned",
          createdAt,
          updatedAt: new Date("2026-08-20T09:00:00.000Z"),
        },
        {
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
