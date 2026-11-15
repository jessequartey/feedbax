import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";
import { renderToString } from "react-dom/server";

import { PostDetailView } from "../../src/components/portal/post-detail.tsx";
import { RichTextField } from "../../src/components/portal/rich-text-field.tsx";
import { Markdown } from "../../src/components/portal/markdown.tsx";
import { fixtureGetPost, fixtureId, fixtureListComments } from "../fixtures/portal.ts";
import { renderPage, viewerOf } from "./helpers.tsx";

const viewer = viewerOf(null);

describe("formatted bodies render the same everywhere", () => {
  const post = fixtureGetPost(fixtureId(1))!;
  const comments = fixtureListComments(fixtureId(1));
  const comment = (text: string) => ({
    ...comments,
    total: 1,
    items: [
      {
        id: fixtureId(9001),
        postId: post.id,
        body: text,
        createdAt: "2026-11-14T10:00:00.000Z",
        author: { id: fixtureId(9002), name: "Ada", anonymous: false },
      },
    ],
  });
  const body = "## Heading\n\nSome **bold** and [a link](https://example.com).\n\n- one\n- two";

  it("renders the post body as formatted text on the post page", async () => {
    const output = await renderPage(
      <PostDetailView post={{ ...post, body }} comments={comments} />,
      viewer,
    );
    expect(output).toContain("<h3");
    expect(output).toContain('<strong class="font-semibold">bold</strong>');
    expect(output).toContain('rel="noopener nofollow ugc"');
    expect(output).toContain("<li");
  });

  it("renders comments through the same renderer", async () => {
    const output = await renderPage(
      <PostDetailView
        post={post}
        comments={comment("A **formatted** [c](https://example.com/c)")}
      />,
      viewer,
    );
    expect(output).toContain('<strong class="font-semibold">formatted</strong>');
    expect(output).toContain('href="https://example.com/c"');
  });

  it("shows hostile bodies as text on the post and comment pages", async () => {
    const hostile =
      '<script>alert(1)</script> <img src=x onerror="alert(1)"> [x](javascript:alert(1))';
    const output = await renderPage(
      <PostDetailView post={{ ...post, body: hostile }} comments={comment(hostile)} />,
      viewer,
    );
    expect(output).not.toContain("<script");
    expect(output).not.toMatch(/<img[^>]*onerror/);
    expect(output).not.toContain("javascript:");
    expect(output).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("keeps plain text the way it was typed: line breaks, spacing and symbols", () => {
    const output = renderToString(<Markdown source={"one\ntwo   spaced\n\n5 * 3 = 15 [x]"} />);
    expect(output).toContain("one<br/>two   spaced");
    expect(output).toContain("5 * 3 = 15 [x]");
    expect(output).toContain("whitespace-pre-wrap");
  });
});

describe("the editor seam", () => {
  const props = { id: "body", value: "**hi**", onChange: () => {}, maxLength: 5000 };

  it("is a plain textarea with a Markdown hint until an editor replaces it", () => {
    const output = renderToString(<RichTextField {...props} name="body" />);
    expect(output).toContain("<textarea");
    expect(output).toContain('name="body"');
    expect(output).toContain('maxLength="5000"');
    expect(output).toContain("**hi**");
    expect(output).toContain("Markdown supported");
    expect(output).toContain('aria-describedby="body-markdown"');
    expect(output).toContain('data-rich-text="post"');
  });

  it("passes the variant, error wiring and can hide the hint", () => {
    const output = renderToString(
      <RichTextField
        {...props}
        variant="comment"
        aria-invalid
        aria-describedby="body-error"
        hideHint
      />,
    );
    expect(output).toContain('data-rich-text="comment"');
    expect(output).toContain('aria-invalid="true"');
    expect(output).toContain('aria-describedby="body-error"');
    expect(output).not.toContain("Markdown supported");
  });

  it("keeps the editor in a lazy chunk so the textarea is what renders first", () => {
    const source = readFileSync(
      new URL("../../src/components/portal/rich-text-field.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('import("./rich-text-editor")');
    expect(source).not.toContain("@tiptap/");
  });
});
