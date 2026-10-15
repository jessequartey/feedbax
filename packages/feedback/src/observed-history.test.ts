import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createFeedbackModule, type Post } from "./index";
import { createObservedHistoryModule } from "./observed-history";

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
});

it("records only observed public progress, deduplicates retries and revokes history while unpublished", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  const path = "0009_observed_history.sql";
  await database.exec(
    await readFile(
      existsSync(`apps/portal/migrations/${path}`)
        ? `apps/portal/migrations/${path}`
        : `migrations/${path}`,
      "utf8",
    ),
  );
  let time = 10000;
  const post: Post = {
    id: "private-provider-id",
    slug: "export-reports",
    title: "Export reports",
    description: "Public description",
    type: "Feature Request",
    status: "New",
    published: false,
    createdAt: new Date(1000),
    updatedAt: new Date(2000),
    submitter: { name: "Private name", email: "private@example.com" },
    teamResponse: "Private draft response",
  };
  const view = () =>
    createObservedHistoryModule({
      database,
      feedback: createFeedbackModule({ initialItems: [{ ...post }] }),
      now: () => time,
    });
  expect((await view().list({ slug: post.slug })).items).toEqual([]);
  post.status = "Planned";
  post.published = true;
  post.teamResponse = "Approved current response";
  expect((await view().list({ slug: post.slug })).items).toEqual([]);
  post.status = "In Progress";
  post.teamResponse = "Work has started";
  time = 20000;
  const first = await view().list({ slug: post.slug });
  expect(first.items).toMatchObject([
    { kind: "status", status: "In Progress", observedAt: new Date(20000) },
    { kind: "update", body: "Work has started", observedAt: new Date(20000) },
  ]);
  expect((await view().list({ slug: post.slug })).items).toEqual(first.items);
  expect(JSON.stringify(first)).not.toMatch(
    /Private|private-provider-id|private@example|actor|subject/,
  );
  post.published = false;
  post.teamResponse = "Private later discussion";
  time = 30000;
  expect((await view().list({ slug: post.slug })).items).toEqual([]);
  post.status = "Shipped";
  post.published = true;
  time = 40000;
  expect((await view().list({ slug: post.slug })).items).toEqual(first.items);
  post.status = "Planned";
  post.teamResponse = "Another approved update";
  time = 50000;
  await Promise.all([view().observe(post.slug), view().observe(post.slug)]);
  expect((await view().list({ slug: post.slug })).items).toHaveLength(4);
  post.status = "Shipped";
  time = 60000;
  await database.exec(
    "CREATE TRIGGER fail_history BEFORE INSERT ON public_post_history BEGIN SELECT RAISE(FAIL,'History unavailable'); END;",
  );
  await expect(view().observe(post.slug)).rejects.toThrow();
  await database.exec("DROP TRIGGER fail_history;");
  expect((await view().list({ slug: post.slug })).items).toHaveLength(5);
});

it("paginates a longer observed timeline without duplicates and rejects another Post's cursor", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  await database.exec(
    await readFile(
      existsSync("apps/portal/migrations/0009_observed_history.sql")
        ? "apps/portal/migrations/0009_observed_history.sql"
        : "migrations/0009_observed_history.sql",
      "utf8",
    ),
  );
  const post: Post = {
    id: "source-id",
    slug: "long-history",
    title: "Long history",
    description: "Public",
    type: "General Feedback",
    status: "Planned",
    published: true,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  };
  let time = 1000;
  const view = () =>
    createObservedHistoryModule({
      database,
      feedback: createFeedbackModule({ initialItems: [{ ...post }] }),
      now: () => time,
    });
  await view().observe(post.slug);
  for (let i = 0; i < 27; i++) {
    time++;
    post.status = i % 2 ? "Planned" : "In Progress";
    await view().observe(post.slug);
  }
  const first = await view().list({ slug: post.slug });
  expect(first.items).toHaveLength(25);
  expect(first.items[0]).toMatchObject({
    kind: "status",
    status: "In Progress",
    observedAt: new Date(1001),
  });
  const second = await view().list({
    slug: post.slug,
    cursor: first.nextCursor,
  });
  expect(second.items).toHaveLength(2);
  expect(
    new Set([...first.items, ...second.items].map((event) => event.id)).size,
  ).toBe(27);
  post.slug = "another-post";
  await expect(
    view().list({ slug: post.slug, cursor: first.nextCursor }),
  ).rejects.toThrow("cursor");
});
