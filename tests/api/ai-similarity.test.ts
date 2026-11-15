import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { createGeminiProvider } from "../../src/ai/gemini.ts";
import { createJevProvider } from "../../src/ai/jev.ts";
import { createOpenAiProvider } from "../../src/ai/openai.ts";
import { resolveAiProvider } from "../../src/ai/index.ts";
import { listSimilarGroups } from "../../src/server/similar-groups.ts";
import { handleSearchSimilar, suggestSimilarPosts } from "../../src/server/similar-posts.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { saveSettings } from "../../src/server/settings.ts";
import { measure } from "../resources/meter.ts";
import { writer } from "./helpers.ts";

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await resetEnv();
});

async function post(id: string, title: string, createdAt = 1, update?: string) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user (id, name, email, created_at, updated_at) VALUES ('ai-user', 'Ai user', 'ai@example.com', 1, 1)",
  ).run();
  await env.DB.prepare(
    "INSERT INTO posts (id, author_id, title, body, category, created_at, updated_at) VALUES (?, 'ai-user', ?, 'A useful description', 'feature', ?, ?)",
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
    await env.DB.prepare("INSERT INTO votes VALUES ('visible', 'ai-user', 1)").run();

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
    const invalid = await handleSearchSimilar(
      new Request(`https://example.com/api/search/similar?q=${"x".repeat(101)}`),
    );
    expect(invalid.status).toBe(400);
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
    await env.DB.prepare("INSERT INTO votes VALUES ('b', 'ai-user', 1)").run();

    await expect(adminApi.similarGroups(await writer(), undefined)).rejects.toMatchObject({
      code: "forbidden",
    });
    const result = await adminApi.similarGroups(await adminViewer(), undefined);
    expect(result.provider).toBe("local");
    expect(result.scanned).toBe(3);
    expect(result.groups).toHaveLength(1);
    // Highest votes wins as the post to keep.
    expect(result.groups[0]?.target.id).toBe("b");
    expect(result.groups[0]?.duplicates.map((duplicate) => duplicate.id)).toEqual(["a"]);

    const usage = await measure(() => listSimilarGroups());
    expect(usage.queries).toBe(2);
    expect(usage.fetches).toBe(0);
  });

  it("returns no groups when the provider is off, and falls back to local when an external provider fails", async () => {
    await post("a", "Add dark mode support", 1);
    await post("b", "Dark mode support please", 2);
    await saveSettings({ ai: { provider: "off" } });
    expect(await listSimilarGroups()).toEqual({ provider: "off", scanned: 0, groups: [] });

    await saveSettings({ ai: { provider: "gemini" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "nope" }, { status: 500 })),
    );
    const result = await listSimilarGroups(env.DB, "fake-gemini-key-for-tests");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.target.id).toBeDefined();
  });
});

describe("provider adapters (mocked fetch)", () => {
  it("parses category answers from gemini, openai and jev, and falls back on failure", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, init });
        if (url.includes("generativelanguage.googleapis.com"))
          return Response.json({
            candidates: [{ content: { parts: [{ text: '{"category":"bug","confidence":0.9}' }] } }],
          });
        if (url.includes("api.openai.com"))
          return Response.json({
            choices: [{ message: { content: '{"category":"feature","confidence":0.8}' } }],
          });
        return Response.json({
          answers: { category: { type: "choice", choice: "general", confidence: 0.7 } },
        });
      }),
    );
    await expect(
      createGeminiProvider("fake-key").suggestCategory({ title: "App crashes" }),
    ).resolves.toEqual({ category: "bug", confidence: 0.9, source: "gemini" });
    await expect(
      createOpenAiProvider("fake-key").suggestCategory({ title: "Please add export" }),
    ).resolves.toEqual({ category: "feature", confidence: 0.8, source: "openai" });
    await expect(
      createJevProvider("fake-key").suggestCategory({ title: "How do I export?" }),
    ).resolves.toEqual({ category: "general", confidence: 0.7, source: "jev" });
    // Keys travel in headers only, never in the URL, and Jev's state is a string.
    expect(calls.map((call) => call.url.includes("fake-key"))).toEqual([false, false, false]);
    expect(JSON.parse(calls[2]?.init?.body as string).state).toBeTypeOf("string");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const provider = resolveAiProvider({ provider: "openai" }, "fake-key");
    await expect(provider.suggestCategory({ title: "App crashes on save" })).resolves.toEqual({
      category: "bug",
      confidence: 0.7,
      source: "local",
    });
    // No key at all also stays local, with no fetch attempted.
    expect(resolveAiProvider({ provider: "gemini" }, undefined).name).toBe("local");
    expect(resolveAiProvider({ provider: "off" }, "fake-key").name).toBe("local");
  });
});
