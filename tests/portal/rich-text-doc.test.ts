import { describe, expect, it } from "vite-plus/test";

import {
  editorDocToMarkdown,
  editorLinkHref,
  markdownToEditorDoc,
  type EditorNode,
} from "../../src/components/portal/rich-text-doc.ts";
import { markdownToHtml, parseMarkdown, type Inline } from "../../src/lib/markdown.ts";

// Marks on each run of text, so nesting differences (***x*** versus **_x_**) still compare equal.
function signature(source: string): string {
  const walk = (nodes: Inline[], marks: string[]): string => {
    let out = "";
    for (const node of nodes) {
      if (node.type === "text") out += `{${[...marks].sort().join("+")}}${node.text}`;
      else if (node.type === "break") out += "\n";
      else if (node.type === "code") out += `{code}${node.text}`;
      else if (node.type === "strong") out += walk(node.children, [...marks, "bold"]);
      else if (node.type === "em") out += walk(node.children, [...marks, "italic"]);
      else out += walk(node.children, [...marks, `link:${node.href}`]);
    }
    return out;
  };
  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case "code":
          return `code:${block.text}`;
        case "list":
          return `${block.ordered ? `ol${block.start}` : "ul"}:${block.items.map((item) => walk(item, [])).join("|")}`;
        case "heading":
          return `h${block.level}:${walk(block.children, [])}`;
        case "quote":
          return `q:${walk(block.children, [])}`;
        default:
          return `p:${walk(block.children, [])}`;
      }
    })
    .join("\n");
}

const samples = [
  "",
  "hello",
  "one\ntwo",
  "one\n\ntwo",
  "**bold** and *italic* and ***both***",
  "say `code` here",
  "a **bold *and* italic** end",
  "[docs](https://example.com/a)",
  "[mail](mailto:a@example.com)",
  "[x](javascript:alert(1))",
  "<script>alert(1)</script>",
  "### Title\n\n#### Smaller",
  "# Big",
  "##### Tiny",
  "- one\n- two",
  "1. a\n2. b",
  "3. c\n4. d",
  "> a quote\n> second line",
  "> one\n>\n> two",
  "```\nconst a = 1;\n```",
  "```\nconst tick = `x`;\n```",
  "5 * 3 = 15 [x]",
  "![alt](https://example.com/a.png)",
];

describe("the editor document speaks the Markdown subset", () => {
  it.each(samples)("keeps the formatting of %j", (source) => {
    const once = editorDocToMarkdown(markdownToEditorDoc(source));
    const twice = editorDocToMarkdown(markdownToEditorDoc(once));
    expect(signature(once)).toBe(signature(source));
    expect(twice).toBe(once);
  });

  it("drops unsafe links instead of storing them", () => {
    const hostile: EditorNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    const stored = editorDocToMarkdown(hostile);
    expect(stored).not.toContain("javascript:");
    const html = markdownToHtml(stored);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click");
  });

  it("refuses links that are not http, https or mailto", () => {
    expect(editorLinkHref("javascript:alert(1)")).toBeNull();
    expect(editorLinkHref("https://user:pass@example.com/")).toBeNull();
    expect(editorLinkHref("data:text/html,hi")).toBeNull();
    expect(editorLinkHref("example.com/docs")).toBe("https://example.com/docs");
    expect(editorLinkHref("mailto:team@example.com")).toBe("mailto:team@example.com");
  });
});
