import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { addCommentForUser, listCommentPage } from "../../src/server/comments.ts";
import { handlePosts } from "../../src/server/http.ts";
import { createPostForUser, getPostDetail, listPostPage } from "../../src/server/posts.ts";
import { draftExcerpt } from "../../src/server/changelog-draft.ts";
import { LIMITS } from "../../src/contracts/domain.ts";
import { CHANGELOG_LIMITS } from "../../src/contracts/changelog.ts";
import { form, mintToken, writer } from "./helpers.ts";

beforeEach(resetEnv);

async function create(body: string, who?: Awaited<ReturnType<typeof writer>>) {
  const data = form();
  data.set("body", body);
  const author = who ?? (await writer());
  await createPostForUser(data, author);
  return { id: data.get("id") as string, author };
}
const stored = async (id: string) =>
  (await env.DB.prepare("SELECT body FROM posts WHERE id = ?").bind(id).first<{ body: string }>())!
    .body;

describe("bodies are stored as normalized Markdown", () => {
  it("normalizes a post body and keeps formatting", async () => {
    const { id } = await create("# Big\n\n__bold__ and *it* <script>alert(1)</script>\n\n* a\n* b");
    expect(await stored(id)).toBe(
      "### Big\n\n**bold** and *it* \\<script>alert(1)\\</script>\n\n- a\n- b",
    );
  });

  it("drops the URL of an unsafe link and never stores a javascript: or data: target", async () => {
    const { id } = await create(
      "[a](javascript:alert(1)) [b](data:text/html,x) [c](https://example.com) ![d](https://e.com/i.png)",
    );
    const body = await stored(id);
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("data:");
    expect(body).toContain("[c](https://example.com)");
    expect(body).toContain("\\![d](https://e.com/i.png)");
  });

  it("keeps plain text written without formatting readable, whatever the characters", async () => {
    const plain = "The save button says 5 * 3 = 15 and C:\\temp [WIP]\nsecond line";
    const { id, author } = await create(plain);
    expect((await getPostDetail(id, author)).excerpt).toBe(plain.replace(/\s+/g, " "));
  });

  it("applies to the bearer API the same way", async () => {
    const data = form();
    data.set("body", "**bold** [x](javascript:alert(1))");
    const response = await handlePosts(
      new Request(`${env.PORTAL_URL}/api/posts`, {
        method: "POST",
        headers: { authorization: `Bearer ${await mintToken()}` },
        body: data,
      }),
    );
    expect(response.status).toBe(201);
    expect(await stored(data.get("id") as string)).toBe("**bold** x");
  });

  it("rejects a body that is empty once sanitized, and one over the limit", async () => {
    const author = await writer();
    for (const body of ["   ", "[](javascript:alert(1))", "\u0000\u202e"]) {
      const data = form();
      data.set("body", body);
      await expect(createPostForUser(data, author)).rejects.toMatchObject({
        code: "invalid_input",
        field: "body",
      });
    }
    const data = form();
    data.set("body", "a".repeat(LIMITS.body + 1));
    await expect(createPostForUser(data, author)).rejects.toMatchObject({ field: "body" });
    // The limit applies to the stored text: escapes count.
    const escaped = form();
    escaped.set("body", "*".repeat(LIMITS.body));
    await expect(createPostForUser(escaped, author)).rejects.toMatchObject({ field: "body" });
    const exact = form();
    exact.set("body", "a".repeat(LIMITS.body));
    await expect(createPostForUser(exact, author)).resolves.toMatchObject({ status: 201 });
  });

  it("normalizes comments and enforces their limit", async () => {
    const { id, author } = await create("A post");
    const comment = await addCommentForUser(
      { id: crypto.randomUUID(), postId: id, body: "Nice **idea** <b>x</b> [l](javascript:1)" },
      author,
    );
    expect(comment.body).toBe("Nice **idea** \\<b>x\\</b> l");
    expect((await listCommentPage({ postId: id })).items[0]!.body).toBe(comment.body);
    await expect(
      addCommentForUser(
        { id: crypto.randomUUID(), postId: id, body: "x".repeat(LIMITS.comment + 1) },
        author,
      ),
    ).rejects.toMatchObject({ field: "body" });
    await expect(
      addCommentForUser({ id: crypto.randomUUID(), postId: id, body: "[](javascript:1)" }, author),
    ).rejects.toMatchObject({ field: "body" });
  });

  it("normalizes changelog entries on create and edit, and allows an empty body", async () => {
    const who = { ...(await writer()), admin: true as const };
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(who.id).run();
    const created = await adminApi.changelogCreate(who, {
      title: "Shipped",
      body: "## Hi\n\n<script>x</script> [a](javascript:alert(1)) [ok](https://example.com)",
    });
    expect(created.body).toBe("### Hi\n\n\\<script>x\\</script> a [ok](https://example.com)");
    const edited = await adminApi.changelogUpdate(who, {
      id: created.id,
      title: "Shipped",
      body: "* one",
    });
    expect(edited.body).toBe("- one");
    expect(
      (await adminApi.changelogUpdate(who, { id: created.id, title: "Shipped", body: "" })).body,
    ).toBe("");
    await expect(
      adminApi.changelogCreate(who, {
        title: "Too long",
        body: "a".repeat(CHANGELOG_LIMITS.body + 1),
      }),
    ).rejects.toMatchObject({ field: "body" });
  });
});

describe("lists and search use the text a reader sees", () => {
  it("shows a plain-text excerpt without markup", async () => {
    const { author } = await create(
      "## Title\n\nSome **bold** and [a link](https://example.com) and `code`.\n\n- item one\n- item two",
    );
    const page = await listPostPage({}, author, true);
    expect(page.items[0]!.excerpt).toBe("Title Some bold and a link and code. item one item two");
  });

  it("finds text across formatting, and text that was escaped", async () => {
    await create("This is **really** slow on the *first* load [WIP] snake_case");
    for (const q of ["really slow", "first load", "[WIP]", "snake_case", "really"])
      expect((await listPostPage({ q }, null)).total, q).toBe(1);
    expect((await listPostPage({ q: "nothing here" }, null)).total).toBe(0);
    // A query made only of markup characters matches titles only and never errors.
    expect((await listPostPage({ q: "**" }, null)).total).toBe(0);
  });

  it("starts a changelog draft from the post as escaped plain text", () => {
    expect(draftExcerpt("**Bold** idea with `code` and 2 * 3 * 4")).toBe(
      "Bold idea with code and 2 \\* 3 \\* 4",
    );
    expect(draftExcerpt("x".repeat(500))).toBe(`${"x".repeat(280)}…`);
  });
});

describe("posts written before formatting existed", () => {
  it("render and sync from the raw text without any migration", async () => {
    const { id, author } = await create("placeholder");
    // An old row: whatever the user typed, stored verbatim.
    const legacy =
      "Crash on save\n\n  1) open file\n  2) press Ctrl+S\n\nsnake_case, 2 * 3, <div> and @bob";
    await env.DB.prepare("UPDATE posts SET body = ? WHERE id = ?").bind(legacy, id).run();
    const detail = await getPostDetail(id, author);
    expect(detail.body).toBe(legacy);
    expect(detail.excerpt).toContain("snake_case, 2 * 3, <div> and @bob");
  });
});
