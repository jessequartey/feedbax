import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { listSimilarGroups } from "../../src/server/similar-groups.ts";
import { handleSearchSimilar, suggestSimilarPosts } from "../../src/server/similar-posts.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { measure } from "../resources/meter.ts";
import { writer } from "./helpers.ts";

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await resetEnv();
});

async function post(id: string, title: string, createdAt = 1, update?: string) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user (id, name, email, created_at, updated_at) VALUES ('sim-user', 'Sim user', 'sim@example.com', 1, 1)",
  ).run();
  await env.DB.prepare(
    "INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES (?, 'sim-user', ?, 'A useful description', 'feature', ?, ?)",
  )
    .bind(id, title, createdAt, createdAt)
    .run();
  if (update) await env.DB.prepare(update).bind(id).run();
}

const adminViewer = async () => {
  const user = await writer();
  await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(user.id).run();
  return { ...user, admin: true as const };
};

describe("similar posts while typing", () => {
  it("returns public matches with votes, excludes hidden/spam/merged, and needs 4 characters", async () => {
    await post("visible", "Add dark mode toggle", 1);
    await post("hidden", "Add dark mode toggle", 2, "UPDATE posts SET hidden_at = 1 WHERE id = ?");
    await post("spam", "Add dark mode toggle", 3, "UPDATE posts SET spam = 1 WHERE id = ?");
    await post(
      "merged",
      "Add dark mode toggle",
      4,
      "UPDATE posts SET merged_into = 'visible' WHERE id = ?",
    );
    await env.DB.prepare("INSERT INTO votes VALUES ('visible', 'sim-user', 1)").run();

    expect(await suggestSimilarPosts("abc")).toEqual({ items: [], suggestedCategory: null });
    const result = await suggestSimilarPosts("dark mode");
    expect(result.items).toEqual([
      { id: "visible", title: "Add dark mode toggle", status: "open", votes: 1 },
    ]);

    const usage = await measure(() => suggestSimilarPosts("dark mode"));
    expect(usage.queries).toBe(1);
    expect(usage.rowsWritten).toBe(0);
    expect(usage.fetches).toBe(0);

    const response = await handleSearchSimilar(
      new Request("https://example.com/api/search/similar?q=dark%20mode"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=15");
    // Titles can be longer than the search limit: the query is truncated, never rejected,
    // and FTS operators in it are plain text matched against the title column only.
    await post(
      "body-only",
      "Unrelated roadmap",
      5,
      "UPDATE posts SET body = 'dark mode near body' WHERE id = ?",
    );
    for (const q of ["x".repeat(150), "dark mode ".repeat(20), '"dark" NEAR(mode) -x* body:']) {
      const tolerated = await handleSearchSimilar(
        new Request(`https://example.com/api/search/similar?q=${encodeURIComponent(q)}`),
      );
      expect(tolerated.status).toBe(200);
      const { items } = (await tolerated.json()) as { items: { id: string }[] };
      expect(items.map((item) => item.id)).not.toContain("body-only");
    }
  });

  it("needs two shared words, ignores stopwords, and suggests a type only when it is offered", async () => {
    await post("export", "Export crashes on save");
    await post("dash", "Dashboard widgets for admins");
    // One shared word ("export"), or only stopwords in common, is not a duplicate.
    expect((await suggestSimilarPosts("please export the dashboard data")).items).toEqual([]);
    expect((await suggestSimilarPosts("the export crashes")).items.map((item) => item.id)).toEqual([
      "export",
    ]);
    // A word still being typed matches its prefix.
    expect((await suggestSimilarPosts("export cras")).items.map((item) => item.id)).toEqual([
      "export",
    ]);

    expect((await suggestSimilarPosts("export crashes")).suggestedCategory).toBe("bug");
    expect((await suggestSimilarPosts("please add export")).suggestedCategory).toBe("feature");
    expect((await suggestSimilarPosts("weekly sync notes")).suggestedCategory).toBe("general");
    expect((await suggestSimilarPosts("export crashes", ["feature"])).suggestedCategory).toBeNull();
  });
});

describe("admin similar groups", () => {
  it("groups open public posts by title overlap and requires admin", async () => {
    await post("a", "Add dark mode support", 1);
    await post("b", "Dark mode support please", 2);
    await post("c", "Export to CSV file", 3);
    await post(
      "closed",
      "Add dark mode support",
      4,
      "UPDATE posts SET status = 'closed' WHERE id = ?",
    );
    await post("hidden", "Add dark mode support", 5, "UPDATE posts SET hidden_at = 1 WHERE id = ?");
    await env.DB.prepare("INSERT INTO votes VALUES ('b', 'sim-user', 1)").run();

    await expect(adminApi.similarGroups(await writer(), undefined)).rejects.toMatchObject({
      code: "forbidden",
    });
    const result = await adminApi.similarGroups(await adminViewer(), undefined);
    expect(result.scanned).toBe(3);
    expect(result.groups).toHaveLength(1);
    // Highest votes wins as the post to keep.
    expect(result.groups[0]?.target.id).toBe("b");
    expect(result.groups[0]?.duplicates.map((duplicate) => duplicate.id)).toEqual(["a"]);

    const usage = await measure(() => listSimilarGroups());
    expect(usage.queries).toBe(1);
    expect(usage.fetches).toBe(0);
  });
});
