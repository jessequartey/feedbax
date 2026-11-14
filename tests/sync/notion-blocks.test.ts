import { describe, expect, it } from "vite-plus/test";

import {
  markdownToNotionBlocks,
  NOTION_BLOCK_LIMIT,
  NOTION_RICH_TEXT_LIMIT,
  NOTION_TEXT_LIMIT,
  type NotionBlock,
} from "../../src/integrations/notion-blocks.ts";

type Run = {
  text: { content: string; link?: { url: string } };
  annotations?: Record<string, boolean>;
};
const runsOf = (block: NotionBlock): Run[] => (block[block.type] as { rich_text: Run[] }).rich_text;

describe("Markdown to Notion blocks", () => {
  it("converts every block of the subset", () => {
    const blocks = markdownToNotionBlocks(
      "### Section\n\n#### Sub\n\nA paragraph.\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n```\ncode\n```",
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading_2",
      "heading_3",
      "paragraph",
      "bulleted_list_item",
      "bulleted_list_item",
      "numbered_list_item",
      "numbered_list_item",
      "quote",
      "code",
    ]);
    expect(blocks.every((block) => block.object === "block")).toBe(true);
    expect(runsOf(blocks[3]!)[0]!.text.content).toBe("one");
    expect(blocks[8]!.code).toMatchObject({
      language: "plain text",
      rich_text: [{ type: "text", text: { content: "code" } }],
    });
  });

  it("maps bold, italic, code and links to annotations", () => {
    const [paragraph] = markdownToNotionBlocks(
      "plain **bold** *italic* `code` ***both*** [link](https://example.com/a) [**bold link**](mailto:a@b.co)",
    );
    const runs = runsOf(paragraph!);
    const find = (content: string) => runs.find((run) => run.text.content === content)!;
    expect(find("plain ").annotations).toBeUndefined();
    expect(find("bold").annotations).toEqual({ bold: true });
    expect(find("italic").annotations).toEqual({ italic: true });
    expect(find("code").annotations).toEqual({ code: true });
    expect(find("both").annotations).toEqual({ italic: true, bold: true });
    expect(find("link").text.link).toEqual({ url: "https://example.com/a" });
    expect(find("bold link")).toMatchObject({
      text: { link: { url: "mailto:a@b.co" } },
      annotations: { bold: true },
    });
  });

  it("never sends a refused link, raw HTML or an image as anything but text", () => {
    const blocks = markdownToNotionBlocks(
      "[x](javascript:alert(1)) <script>alert(1)</script> ![i](https://example.com/i.png)",
    );
    const json = JSON.stringify(blocks);
    expect(json).not.toContain("javascript:");
    expect(json).toContain("<script>alert(1)</script>");
    expect(json).not.toContain('"image"');
    // The image URL is a link on the alt text: nothing is fetched or embedded.
    expect(json).toContain('"link":{"url":"https://example.com/i.png"}');
  });

  it("keeps line breaks inside a paragraph as newlines", () => {
    const [paragraph] = markdownToNotionBlocks("one\ntwo");
    expect(
      runsOf(paragraph!)
        .map((run) => run.text.content)
        .join(""),
    ).toBe("one\ntwo");
  });

  it("splits text at 2000 UTF-16 units without cutting a surrogate pair", () => {
    const content = "x".repeat(1999) + "😀" + "y".repeat(3000);
    const [paragraph] = markdownToNotionBlocks(content);
    const runs = runsOf(paragraph!);
    expect(runs.every((run) => run.text.content.length <= NOTION_TEXT_LIMIT)).toBe(true);
    expect(runs.map((run) => run.text.content).join("")).toBe(content);
    // Formatting is kept on every piece.
    const [bold] = markdownToNotionBlocks(`**${"b".repeat(4500)}**`);
    expect(runsOf(bold!).length).toBe(3);
    expect(runsOf(bold!).every((run) => run.annotations?.bold)).toBe(true);
  });

  it("splits a long code block into 2000-unit objects", () => {
    const code = Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n");
    const [block] = markdownToNotionBlocks("```\n" + code + "\n```");
    const runs = runsOf(block!);
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.every((run) => run.text.content.length <= NOTION_TEXT_LIMIT)).toBe(true);
    expect(runs.map((run) => run.text.content).join("")).toBe(code);
  });

  it("keeps at most 100 rich-text objects per block", () => {
    const source = Array.from({ length: 400 }, (_, i) => `**b${i}** *i${i}*`).join(" ");
    const [paragraph] = markdownToNotionBlocks(source);
    const runs = runsOf(paragraph!);
    expect(runs.length).toBeLessThanOrEqual(NOTION_RICH_TEXT_LIMIT);
    expect(runs.every((run) => run.text.content.length <= NOTION_TEXT_LIMIT)).toBe(true);
  });

  it("keeps at most 100 blocks and points at the full post for the rest", () => {
    const source = Array.from({ length: 300 }, (_, i) => `- item ${i}`).join("\n");
    const blocks = markdownToNotionBlocks(source, "https://portal.example/posts/1");
    expect(blocks).toHaveLength(NOTION_BLOCK_LIMIT);
    expect(blocks[98]!.type).toBe("bulleted_list_item");
    expect(runsOf(blocks[99]!)).toEqual([
      {
        type: "text",
        text: {
          content: "Read the full text on the portal.",
          link: { url: "https://portal.example/posts/1" },
        },
      },
    ]);
    expect(markdownToNotionBlocks(source)).toHaveLength(NOTION_BLOCK_LIMIT);
    expect(markdownToNotionBlocks("- a\n- b")).toHaveLength(2);
  });

  it("gives no blocks for an empty body and handles hostile input", () => {
    expect(markdownToNotionBlocks("")).toEqual([]);
    expect(markdownToNotionBlocks("   \n\n")).toEqual([]);
    const started = performance.now();
    markdownToNotionBlocks("*a ".repeat(5000) + "[".repeat(5000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
