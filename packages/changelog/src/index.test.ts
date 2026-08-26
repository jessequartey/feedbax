import { describe, expect, it } from "vitest";

import {
  createChangelogModule,
  createInMemoryChangelogStorage,
  type ChangelogDate,
  type StoredChangelogEntry,
} from ".";

describe("Changelog module", () => {
  it("returns only Published Changelog Entries in deterministic Date order", async () => {
    const changelog = createChangelogModule({
      storage: createInMemoryChangelogStorage([
        entry({ id: "z", slug: "draft", published: false, date: "2026-08-30" }),
        entry({ id: "b", slug: "second", date: "2026-08-20" }),
        entry({ id: "a", slug: "first", date: "2026-08-20" }),
        entry({ id: "c", slug: "older", date: "2026-08-10" }),
      ]),
    });

    await expect(changelog.listPublishedEntries()).resolves.toMatchObject({
      items: [{ slug: "first" }, { slug: "second" }, { slug: "older" }],
    });
  });

  it("filters Labels and continues in stable batches of 20", async () => {
    const changelog = createChangelogModule({
      storage: createInMemoryChangelogStorage(
        Array.from({ length: 22 }, (_, index) =>
          entry({
            id: String(index).padStart(2, "0"),
            slug: `entry-${index}`,
            date: `2026-08-${String(22 - index).padStart(2, "0")}` as ChangelogDate,
            labels: index === 21 ? ["Fixed"] : ["Improved"],
          }),
        ),
      ),
    });

    const first = await changelog.listPublishedEntries({ label: "Improved" });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await changelog.listPublishedEntries({
      label: "Improved",
      cursor: first.nextCursor,
    });
    expect(second.items.map(({ slug }) => slug)).toEqual(["entry-20"]);
    await expect(
      changelog.listPublishedEntries({ label: "Fixed" }),
    ).resolves.toMatchObject({ items: [{ slug: "entry-21" }] });
  });

  it("starts empty and projects at most one image", async () => {
    await expect(
      createChangelogModule({
        storage: createInMemoryChangelogStorage(),
      }).listPublishedEntries(),
    ).resolves.toEqual({ items: [] });

    const changelog = createChangelogModule({
      storage: createInMemoryChangelogStorage([
        entry({
          images: [
            { src: "https://files.example/first", alt: "First" },
            { src: "https://files.example/second", alt: "Second" },
          ],
        }),
      ]),
    });
    await expect(changelog.listPublishedEntries()).resolves.toMatchObject({
      items: [{ image: { src: "https://files.example/first", alt: "First" } }],
    });
  });
});

function entry(
  overrides: Partial<StoredChangelogEntry> & { date?: ChangelogDate } = {},
): StoredChangelogEntry {
  return {
    id: "entry",
    slug: "entry",
    date: "2026-08-01",
    title: "Entry",
    summary: "Summary",
    body: "Body",
    labels: ["Improved"],
    images: [],
    published: true,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}
