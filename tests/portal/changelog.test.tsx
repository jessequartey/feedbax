import { describe, expect, it } from "vite-plus/test";
import { renderToString } from "react-dom/server";

import type { ChangelogEntry } from "../../src/contracts/changelog.ts";
import { ChangelogView, ChangelogEntryView } from "../../src/components/portal/changelog.tsx";
import { Markdown } from "../../src/components/portal/markdown.tsx";
import { PostDetailView } from "../../src/components/portal/post-detail.tsx";
import { Route as EntryRoute } from "../../src/routes/_portal.changelog.$entryId.tsx";
import { Route as RootRoute } from "../../src/routes/__root.tsx";
import { markdownToHtml, markdownToText, parseMarkdown, safeHref } from "../../src/lib/markdown.ts";
import { fixtureGetPost, fixtureId, fixtureListComments } from "../fixtures/portal.ts";
import { renderPage, viewerOf } from "./helpers.tsx";

const html = (source: string) => renderToString(<Markdown source={source} />);

describe("markdown safety", () => {
  it("shows raw HTML as text and never emits a script or event handler element", () => {
    for (const source of [
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      "text <b onclick=alert(1)>bold</b> text",
      "<iframe src='https://evil.example'></iframe>",
      "```\n<script>alert(1)</script>\n```",
      "> <script>alert(1)</script>",
      "# <script>alert(1)</script>",
      "- <script>alert(1)</script>",
      "**<script>alert(1)</script>**",
      "[<script>alert(1)</script>](https://example.com)",
    ]) {
      for (const output of [html(source), markdownToHtml(source)]) {
        // Only the renderer's own tags exist, and none of them carries an event handler.
        const tags = output.match(/<[^>]*>/g) ?? [];
        for (const tag of tags) {
          expect(tag, source).toMatch(
            /^<\/?(div|p|h[345]|ul|ol|li|strong|em|code|a|br|pre|blockquote|hr)[\s/>]/,
          );
          expect(tag, source).not.toMatch(/\son\w+=/i);
        }
        expect(output, source).toMatch(/&lt;/);
      }
    }
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/path",
    "/\\evil.example",
    "ftp://example.com/file",
    "relative/path",
    "#fragment",
    "",
  ])("neutralizes the link target %j", (href) => {
    expect(safeHref(href)).toBeNull();
    const source = `[click me](${href.replace(/\s/g, "")}) and [again](${href.replace(/\s/g, "")})`;
    for (const output of [html(source), markdownToHtml(source)]) {
      expect(output).not.toMatch(/href=/);
      expect(output).toContain("click me");
    }
  });

  it("keeps safe links and gives every one rel noopener nofollow", () => {
    for (const [href, expected] of [
      ["https://example.com/a?b=1&c=2", "https://example.com/a?b=1&amp;c=2"],
      ["http://example.com", "http://example.com"],
      ["mailto:team@example.com", "mailto:team@example.com"],
      ["/posts/abc", "/posts/abc"],
    ] as const) {
      expect(safeHref(href)).toBe(href);
      for (const output of [html(`[x](${href})`), markdownToHtml(`[x](${href})`)]) {
        expect(output).toContain(`href="${expected}"`);
        expect(output).toContain('rel="noopener nofollow"');
      }
    }
    // External links open in a new tab, site links do not.
    expect(html("[x](https://example.com)")).toContain('target="_blank"');
    expect(html("[x](/posts/abc)")).not.toContain("target=");
  });

  it("cannot break out of an attribute with quotes in the URL", () => {
    const output = markdownToHtml('[x](https://example.com/"onmouseover="alert(1))');
    expect(output).not.toMatch(/onmouseover="/);
    expect(html('[x](https://example.com/"onmouseover="alert(1))')).not.toMatch(/\sonmouseover=/);
  });

  it("does not turn images into elements", () => {
    const output = html("![alt](https://example.com/x.png)");
    expect(output).not.toContain("<img");
    expect(output).not.toContain("src=");
  });

  it("renders the supported subset", () => {
    const output = html(
      "# Title\n\nSome **bold**, *italic* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> quote\n\n```\nblock <b>\n```\n\n---",
    );
    for (const part of [
      "<h3",
      "<strong",
      "<em>italic</em>",
      "<code",
      "<ul",
      "<ol",
      "<blockquote",
      "<pre",
      "<hr",
    ])
      expect(output).toContain(part);
    expect(output).toContain("block &lt;b&gt;");
  });

  it("handles hostile and pathological input in bounded time", () => {
    const started = Date.now();
    const nasty = [
      "*".repeat(50_000),
      "[".repeat(20_000) + "x" + "](".repeat(20_000),
      "**a ".repeat(10_000),
      "`".repeat(30_000),
      "[a](" + "(".repeat(20_000),
      ">".repeat(20_000),
      "- ".repeat(20_000),
    ];
    for (const source of nasty) markdownToHtml(source);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(parseMarkdown("")).toEqual([]);
  });

  it("makes a one-line plain-text description", () => {
    expect(
      markdownToText("# Hi\n\n**Bold** [link](https://x.example) and `code`.\n\n- a\n- b"),
    ).toBe("Hi Bold link and code. a b");
    expect(markdownToText("x".repeat(500)).length).toBe(160);
  });
});

const entry = (patch: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id: fixtureId(7001),
  title: "Dark mode is here",
  body: "We shipped **dark mode** <script>alert(1)</script>.",
  publishedAt: "2026-11-05T10:00:00.000Z",
  posts: [{ id: fixtureId(1), title: "Dark mode for the dashboard", status: "done" }],
  ...patch,
});
const viewer = viewerOf(null);

describe("the public changelog", () => {
  it("lists entries with title, date, rendered body and linked posts", async () => {
    const output = await renderPage(
      <ChangelogView
        page={{ items: [entry()], page: 1, limit: 10, total: 1, hasMore: false }}
        onPage={() => {}}
      />,
      viewer,
    );
    expect(output).toContain("Dark mode is here");
    expect(output).toContain("Nov 5, 2026");
    expect(output).toMatch(/datetime="2026-11-05T10:00:00.000Z"/i);
    expect(output).toContain("<strong");
    expect(output).not.toContain("<script");
    expect(output).toContain("Dark mode for the dashboard");
    expect(output).toContain(`href="/posts/${fixtureId(1)}"`);
    expect(output).toContain(`href="/changelog/${fixtureId(7001)}"`);
    expect(output).toContain('href="/changelog.rss"');
  });
  it("has an empty state", async () => {
    const output = await renderPage(
      <ChangelogView
        page={{ items: [], page: 1, limit: 10, total: 0, hasMore: false }}
        onPage={() => {}}
      />,
      viewer,
    );
    expect(output).toContain("Nothing here yet");
  });
  it("the detail page shows the entry as its h1", async () => {
    const output = await renderPage(<ChangelogEntryView entry={entry()} />, viewer);
    expect(output).toMatch(/<h1[^>]*>Dark mode is here<\/h1>/);
    expect(output).toContain("All updates");
  });
  it("gives the detail page its own head meta, and every page the RSS link", async () => {
    const head = await EntryRoute.options.head!({
      loaderData: entry({ body: "We shipped **dark mode** for [everyone](https://x.example)." }),
      matches: [],
    } as never);
    expect(head!.meta).toEqual(
      expect.arrayContaining([
        { title: "Dark mode is here · Feedbax" },
        { name: "description", content: "We shipped dark mode for everyone." },
        { property: "og:title", content: "Dark mode is here" },
        { property: "og:type", content: "article" },
      ]),
    );
    const root = await RootRoute.options.head!({} as never);
    expect(root!.links).toContainEqual({
      rel: "alternate",
      type: "application/rss+xml",
      title: "Changelog",
      href: "/changelog.rss",
    });
  });
});

describe("Shipped in on the post page", () => {
  const post = fixtureGetPost(fixtureId(1))!;
  const comments = fixtureListComments(fixtureId(1));
  it("shows a link to the entry that shipped the post", async () => {
    const output = await renderPage(
      <PostDetailView
        post={{ ...post, shippedIn: [{ id: fixtureId(7001), title: "v1.4 release" }] }}
        comments={comments}
      />,
      viewer,
    );
    expect(output).toContain("Shipped in");
    expect(output).toContain(`href="/changelog/${fixtureId(7001)}"`);
    expect(output).toContain("v1.4 release");
  });
  it("shows nothing when no published entry links the post", async () => {
    const output = await renderPage(<PostDetailView post={post} comments={comments} />, viewer);
    expect(output).not.toContain("Shipped in");
  });
});
