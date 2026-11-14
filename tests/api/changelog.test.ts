import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { flushWaitUntil, resetEnv } from "../fixtures/cloudflare-workers.ts";
import type { ChangelogPublishedEvent } from "../../src/contracts/changelog.ts";
import type { ViewerUser } from "../../src/contracts/domain.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import {
  getPublishedEntry,
  listFeedEntries,
  listPublishedEntries,
} from "../../src/server/changelog.ts";
import { changelogPublishedSinks } from "../../src/server/changelog-events.ts";
import { handleChangelogFeed, renderFeed, xmlEscape } from "../../src/server/changelog-feed.ts";
import { getPostDetail, createPostForUser } from "../../src/server/posts.ts";
import { form, writer } from "./helpers.ts";

beforeEach(async () => {
  await resetEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  changelogPublishedSinks.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const count = async (table: string, where = "1=1") =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<{
    n: number;
  }>())!.n;
async function admin(): Promise<ViewerUser & { admin: true }> {
  const user = await writer();
  await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(user.id).run();
  return { ...user, admin: true };
}
async function post(author: ViewerUser, title = "Dark mode") {
  const data = form();
  data.set("title", title);
  await createPostForUser(data, author);
  return data.get("id") as string;
}
/** A published entry via the admin API, the way the UI does it. */
async function entry(
  who: ViewerUser & { admin: true },
  input: { title: string; body?: string; postIds?: string[]; publish?: boolean },
) {
  const created = await adminApi.changelogCreate(who, {
    title: input.title,
    body: input.body ?? "",
    postIds: input.postIds,
  });
  return input.publish === false
    ? created
    : adminApi.changelogSetStatus(who, { id: created.id, published: true });
}

describe("the admin guard on the changelog", () => {
  it("rejects every changelog admin function for anyone who is not an admin, changing nothing", async () => {
    const author = await writer(),
      postId = await post(author);
    const viewers: (ViewerUser | null)[] = [
      null,
      author,
      { ...(await admin()), banned: true },
      { ...(await admin()), kind: "anonymous" },
    ];
    const inputs = {
      changelogList: {},
      changelogCreate: { title: "Hijacked", body: "", postIds: [postId] },
      changelogUpdate: { id: crypto.randomUUID(), title: "x", body: "" },
      changelogDelete: { id: crypto.randomUUID() },
      changelogSetStatus: { id: crypto.randomUUID(), published: true },
      changelogSearchPosts: { q: "" },
    };
    const names = Object.keys(adminApi).filter((name) => name.startsWith("changelog"));
    expect(names.sort()).toEqual(Object.keys(inputs).sort());
    for (const name of names as (keyof typeof inputs)[])
      for (const viewer of viewers)
        await expect(
          (adminApi[name] as (v: ViewerUser | null, input: unknown) => Promise<unknown>)(
            viewer,
            inputs[name],
          ),
          `${name} as ${viewer?.name ?? "signed out"}`,
        ).rejects.toMatchObject({ code: expect.stringMatching(/^(unauthenticated|forbidden)$/) });
    expect(await count("changelog_entries")).toBe(0);
    expect(await count("changelog_posts")).toBe(0);
  });
});

describe("drafts are not public", () => {
  it("never appear in the list, the detail page, the feed or Shipped in", async () => {
    const who = await admin(),
      author = await writer(),
      postId = await post(author);
    const draft = await entry(who, {
      title: "Secret draft",
      body: "Not yet",
      postIds: [postId],
      publish: false,
    });
    expect(draft.status).toBe("draft");
    expect(await listPublishedEntries({})).toMatchObject({ items: [], total: 0 });
    await expect(getPublishedEntry(draft.id)).rejects.toMatchObject({ isNotFound: true });
    expect(await listFeedEntries()).toEqual([]);
    expect(JSON.stringify(await getPostDetail(postId, null))).not.toContain("Secret draft");
    const feed = await (await handleChangelogFeed()).text();
    expect(feed).not.toContain("Secret draft");

    await adminApi.changelogSetStatus(who, { id: draft.id, published: true });
    expect((await listPublishedEntries({})).items.map((item) => item.title)).toEqual([
      "Secret draft",
    ]);
    // Unpublishing takes it out of every public surface again.
    await adminApi.changelogSetStatus(who, { id: draft.id, published: false });
    expect(await listPublishedEntries({})).toMatchObject({ total: 0 });
    await expect(getPublishedEntry(draft.id)).rejects.toMatchObject({ isNotFound: true });
    expect((await getPostDetail(postId, null)).shippedIn).toBeUndefined();
    const listed = await adminApi.changelogList(who, {});
    expect(listed.items.map((item) => [item.title, item.status, item.publishedAt])).toEqual([
      ["Secret draft", "draft", null],
    ]);
  });
  it("a malformed or unknown id is just not found", async () => {
    await expect(getPublishedEntry("nope")).rejects.toMatchObject({ isNotFound: true });
    await expect(getPublishedEntry(crypto.randomUUID())).rejects.toMatchObject({
      isNotFound: true,
    });
  });
  it("lists published entries newest first and paginates", async () => {
    const who = await admin();
    for (let i = 1; i <= 12; i++) {
      const made = await entry(who, { title: `Release ${i}` });
      await env.DB.prepare("UPDATE changelog_entries SET published_at = ? WHERE id = ?")
        .bind(i * 1000, made.id)
        .run();
    }
    await entry(who, { title: "Draft", publish: false });
    const first = await listPublishedEntries({});
    expect(first).toMatchObject({ page: 1, limit: 10, total: 12, hasMore: true });
    expect(first.items.map((item) => item.title)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Release ${12 - i}`),
    );
    const second = await listPublishedEntries({ page: 2 });
    expect(second.items.map((item) => item.title)).toEqual(["Release 2", "Release 1"]);
    expect(second.hasMore).toBe(false);
    await expect(listPublishedEntries({ page: 0 })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
  it("linked posts on a public entry skip hidden, spam and merged posts", async () => {
    const who = await admin(),
      author = await writer();
    const shown = await post(author, "Shown"),
      hidden = await post(author, "Hidden later");
    const made = await entry(who, { title: "Release", postIds: [shown, hidden] });
    expect(made.posts.map((p) => p.title).sort()).toEqual(["Hidden later", "Shown"]);
    await adminApi.setPostState(who, { postId: hidden, state: "hidden" });
    expect((await getPublishedEntry(made.id)).posts.map((p) => p.title)).toEqual(["Shown"]);
    // The admin still sees the hidden link, flagged.
    const admins = await adminApi.changelogList(who, {});
    expect(admins.items[0]!.posts).toHaveLength(2);
    expect(admins.items[0]!.posts.find((p) => p.title === "Hidden later")?.visible).toBe(false);
    expect(admins.items[0]!.posts.find((p) => p.title === "Shown")?.visible).toBe(true);
    // A hidden post cannot be newly linked, and unknown ones are rejected.
    await expect(
      adminApi.changelogCreate(who, { title: "x", body: "", postIds: [hidden] }),
    ).rejects.toMatchObject({ code: "invalid_input", field: "postIds" });
    await expect(
      adminApi.changelogCreate(who, { title: "x", body: "", postIds: [crypto.randomUUID()] }),
    ).rejects.toMatchObject({ code: "invalid_input", field: "postIds" });
    // …but saving the entry keeps the link that already exists.
    const saved = await adminApi.changelogUpdate(who, {
      id: made.id,
      title: "Release 2",
      body: "",
      postIds: [shown, hidden],
    });
    expect(saved.posts).toHaveLength(2);
  });
});

describe("admin entries", () => {
  it("create, edit, link, unlink, publish, unpublish and delete", async () => {
    const who = await admin(),
      author = await writer();
    const a = await post(author, "Post A"),
      b = await post(author, "Post B");
    const created = await adminApi.changelogCreate(who, {
      title: "  First  ".trim(),
      body: "**Hello**",
      postIds: [a],
    });
    expect(created).toMatchObject({ title: "First", status: "draft", publishedAt: null });
    expect(created.posts.map((p) => p.id)).toEqual([a]);

    const edited = await adminApi.changelogUpdate(who, {
      id: created.id,
      title: "First, edited",
      body: "Changed",
      postIds: [b],
    });
    expect(edited.posts.map((p) => p.id)).toEqual([b]); // a unlinked, b linked
    const cleared = await adminApi.changelogUpdate(who, {
      id: created.id,
      title: "First, edited",
      body: "Changed",
      postIds: [],
    });
    expect(cleared.posts).toEqual([]);

    const published = await adminApi.changelogSetStatus(who, { id: created.id, published: true });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toEqual(expect.any(String));
    // Doing it twice changes nothing.
    expect(
      (await adminApi.changelogSetStatus(who, { id: created.id, published: true })).publishedAt,
    ).toBe(published.publishedAt);

    await adminApi.changelogDelete(who, { id: created.id });
    expect(await count("changelog_entries")).toBe(0);
    await expect(adminApi.changelogDelete(who, { id: created.id })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      adminApi.changelogUpdate(who, { id: created.id, title: "x", body: "" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("deleting an entry leaves its posts alone and removes its links", async () => {
    const who = await admin(),
      author = await writer(),
      id = await post(author);
    const made = await entry(who, { title: "Gone soon", postIds: [id] });
    await adminApi.changelogDelete(who, { id: made.id });
    expect(await count("posts", `id = '${id}'`)).toBe(1);
    expect(await count("changelog_posts")).toBe(0);
    expect((await getPostDetail(id, null)).shippedIn).toBeUndefined();
  });
  it("validates input", async () => {
    const who = await admin();
    for (const input of [
      { title: "", body: "" },
      { title: "x".repeat(201), body: "" },
      { title: "ok", body: "x".repeat(20_001) },
      { title: "ok", body: "", postIds: "nope" },
      { title: "ok", body: "", postIds: ["not-a-uuid"] },
      { title: "ok", body: "", postIds: Array.from({ length: 21 }, () => crypto.randomUUID()) },
    ])
      await expect(adminApi.changelogCreate(who, input)).rejects.toMatchObject({
        code: "invalid_input",
      });
    await expect(
      adminApi.changelogSetStatus(who, { id: crypto.randomUUID(), published: "yes" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await count("changelog_entries")).toBe(0);
  });
  it("the post picker offers only publicly visible posts, filtered by title", async () => {
    const who = await admin(),
      author = await writer();
    const shown = await post(author, "Export to CSV"),
      other = await post(author, "Dark mode"),
      hidden = await post(author, "Export secrets"),
      spam = await post(author, "Export spam");
    await adminApi.setPostState(who, { postId: hidden, state: "hidden" });
    await adminApi.setPostState(who, { postId: spam, state: "spam" });
    const all = await adminApi.changelogSearchPosts(who, {});
    expect(all.map((p) => p.id).sort()).toEqual([shown, other].sort());
    const filtered = await adminApi.changelogSearchPosts(who, { q: "export" });
    expect(filtered.map((p) => p.title)).toEqual(["Export to CSV"]);
    expect(await adminApi.changelogSearchPosts(who, { q: "100%_" })).toEqual([]);
  });
});

describe("Shipped in on the post page", () => {
  it("lists published entries that link the post, newest first", async () => {
    const who = await admin(),
      author = await writer(),
      id = await post(author);
    expect((await getPostDetail(id, null)).shippedIn).toBeUndefined();
    const older = await entry(who, { title: "v1.0", postIds: [id] });
    await env.DB.prepare("UPDATE changelog_entries SET published_at = 1000 WHERE id = ?")
      .bind(older.id)
      .run();
    const newer = await entry(who, { title: "v1.1", postIds: [id] });
    await entry(who, { title: "Draft only", postIds: [id], publish: false });
    expect((await getPostDetail(id, null)).shippedIn).toEqual([
      { id: newer.id, title: "v1.1" },
      { id: older.id, title: "v1.0" },
    ]);
  });
});

describe("the RSS feed", () => {
  it("is RSS 2.0 with the right content type, absolute URLs and only published entries", async () => {
    const who = await admin(),
      author = await writer(),
      id = await post(author, "Dark mode");
    const made = await entry(who, {
      title: 'Dark mode <is> here & "fast"',
      body: "It's **here**. See [docs](https://example.com/a?b=1&c=2) and <script>alert(1)</script>.",
      postIds: [id],
    });
    await entry(who, { title: "Unpublished", publish: false });

    const response = await handleChangelogFeed();
    expect(response.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const xml = await response.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<link>http://localhost:3000/changelog</link>");
    expect(xml).toContain(`<link>http://localhost:3000/changelog/${made.id}</link>`);
    expect(xml).toContain(
      `<guid isPermaLink="true">http://localhost:3000/changelog/${made.id}</guid>`,
    );
    expect(xml).toContain('href="http://localhost:3000/changelog.rss"');
    expect(xml).toContain(`http://localhost:3000/posts/${id}`);
    expect(xml).not.toContain("Unpublished");
    expect(xml.match(/<item>/g)).toHaveLength(1);
    // Escaped: no raw markup from the entry reaches the document.
    expect(xml).toContain("<title>Dark mode &lt;is&gt; here &amp; &quot;fast&quot;</title>");
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;");
    assertWellFormed(xml);
  });
  it("is valid with no entries, and drops characters XML cannot carry", async () => {
    const empty = await (await handleChangelogFeed()).text();
    expect(empty).not.toContain("<item>");
    expect(empty).not.toContain("lastBuildDate");
    assertWellFormed(empty);

    const xml = renderFeed(
      [
        {
          id: crypto.randomUUID(),
          title: "Bell\u0007 and lone \ud800 surrogate",
          body: "Emoji 🎉 stays\u0000",
          publishedAt: new Date(0).toISOString(),
          posts: [],
        },
      ],
      "Acme & Co",
      "https://feedback.example.com/",
    );
    expect(xml).toContain("Bell and lone  surrogate");
    expect(xml).toContain("🎉");
    expect(xml).toContain("<title>Acme &amp; Co changelog</title>");
    expect(xml).toContain("<link>https://feedback.example.com/changelog</link>");
    expect(xml).toContain("<pubDate>Thu, 01 Jan 1970 00:00:00 GMT</pubDate>");
    assertWellFormed(xml);
  });
  it("uses PORTAL_URL, not the request, for every link", async () => {
    const who = await admin();
    await entry(who, { title: "Release" });
    const previous = env.PORTAL_URL;
    env.PORTAL_URL = "https://feedback.example.com/";
    try {
      const xml = await (await handleChangelogFeed()).text();
      expect(
        xml
          .match(/https?:\/\/[^<"\s]+/g)!
          .every(
            (url) =>
              url.startsWith("https://feedback.example.com") ||
              url.startsWith("http://www.w3.org") ||
              url.startsWith("https://www.w3.org"),
          ),
      ).toBe(true);
      expect(xml).toContain("https://feedback.example.com/changelog.rss");
    } finally {
      env.PORTAL_URL = previous;
    }
  });
  it("xmlEscape escapes the five XML characters", () => {
    expect(xmlEscape(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
    );
  });
});

describe("changelog.published", () => {
  it("fires once per draft → published transition with the entry and its URL", async () => {
    const events: ChangelogPublishedEvent[] = [];
    changelogPublishedSinks.push((event) => void events.push(event));
    const who = await admin(),
      author = await writer(),
      id = await post(author);
    const made = await entry(who, {
      title: "Release",
      body: "Body",
      postIds: [id],
      publish: false,
    });
    expect(events).toEqual([]); // saving a draft is not a publish
    await adminApi.changelogSetStatus(who, { id: made.id, published: true });
    await adminApi.changelogSetStatus(who, { id: made.id, published: true });
    await flushWaitUntil();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      entry: {
        id: made.id,
        title: "Release",
        body: "Body",
        publishedAt: expect.any(String),
        postIds: [id],
      },
      url: `http://localhost:3000/changelog/${made.id}`,
    });
    // Unpublish then publish again is a new publication.
    await adminApi.changelogSetStatus(who, { id: made.id, published: false });
    await adminApi.changelogSetStatus(who, { id: made.id, published: true });
    await flushWaitUntil();
    expect(events).toHaveLength(2);
  });
  it("is a no-op by default and a failing sink never fails or blocks the publish", async () => {
    const who = await admin();
    expect(changelogPublishedSinks).toEqual([]);
    expect((await entry(who, { title: "Quiet" })).status).toBe("published");
    const seen: string[] = [];
    changelogPublishedSinks.push(
      () => {
        throw new Error("secret endpoint https://hooks.example.com/token");
      },
      (event) => void seen.push(event.entry.title),
    );
    expect((await entry(who, { title: "Loud" })).status).toBe("published");
    await flushWaitUntil();
    expect(seen).toEqual(["Loud"]);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("changelog.published.sink_failed");
    expect(logged).not.toContain("hooks.example.com");
  });
});

/** A small well-formedness check: balanced tags, only the five predefined entities, no stray < or &. */
function assertWellFormed(xml: string) {
  const stack: string[] = [];
  let sawRoot = false;
  const tokens = xml.replace(/^<\?xml[^>]*\?>\s*/, "").match(/<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<")) {
      expect(token.endsWith(">")).toBe(true);
      const closing = /^<\/([\w:.-]+)\s*>$/.exec(token);
      const opening =
        /^<([\w:.-]+)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>$/.exec(
          token,
        );
      if (closing) expect(stack.pop()).toBe(closing[1]);
      else {
        expect(opening, `bad tag ${token}`).not.toBeNull();
        if (!stack.length) {
          expect(sawRoot).toBe(false);
          sawRoot = true;
        }
        if (!opening![3]) stack.push(opening![1]!);
      }
    } else {
      expect(token.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, "")).not.toMatch(/&/);
      // oxlint-disable-next-line no-control-regex
      expect(token).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    }
  }
  expect(stack).toEqual([]);
  expect(sawRoot).toBe(true);
}
