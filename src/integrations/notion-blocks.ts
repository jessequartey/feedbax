import { parseMarkdown } from "../lib/markdown.ts";
import type { Block, Inline } from "../lib/markdown.ts";

// A post body (Markdown, src/lib/markdown.ts) as the content blocks of its Notion page.
// Notion's limits are respected here, so the payload is accepted as is: at most 2000 UTF-16
// units per rich-text object, 100 rich-text objects per block and 100 blocks per request.

export const NOTION_TEXT_LIMIT = 2000;
export const NOTION_RICH_TEXT_LIMIT = 100;
export const NOTION_BLOCK_LIMIT = 100;

type Annotations = { bold?: true; italic?: true; code?: true };
export type NotionRichText = {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: Annotations;
};
export type NotionBlock = { object: "block"; type: string } & Record<string, unknown>;

/** Cuts text into pieces of at most `size` UTF-16 units without splitting a surrogate pair. */
function pieces(text: string, size = NOTION_TEXT_LIMIT): string[] {
  const out: string[] = [];
  let piece = "";
  for (const character of text) {
    if (piece.length + character.length > size) {
      out.push(piece);
      piece = "";
    }
    piece += character;
  }
  if (piece) out.push(piece);
  return out;
}

const sameStyle = (a: NotionRichText, b: NotionRichText) =>
  a.text.link?.url === b.text.link?.url &&
  Boolean(a.annotations?.bold) === Boolean(b.annotations?.bold) &&
  Boolean(a.annotations?.italic) === Boolean(b.annotations?.italic) &&
  Boolean(a.annotations?.code) === Boolean(b.annotations?.code);

function runs(nodes: Inline[], annotations: Annotations = {}, url?: string): NotionRichText[] {
  const out: NotionRichText[] = [];
  const add = (content: string) => {
    for (const piece of pieces(content))
      out.push({
        type: "text",
        text: { content: piece, ...(url ? { link: { url } } : {}) },
        ...(Object.keys(annotations).length ? { annotations: { ...annotations } } : {}),
      });
  };
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        add(node.text);
        break;
      case "break":
        add("\n");
        break;
      case "code":
        out.push(...runs([{ type: "text", text: node.text }], { ...annotations, code: true }, url));
        break;
      case "strong":
        out.push(...runs(node.children, { ...annotations, bold: true }, url));
        break;
      case "em":
        out.push(...runs(node.children, { ...annotations, italic: true }, url));
        break;
      case "link":
        // Notion refuses links longer than 2000 characters: keep the text, drop the link.
        out.push(
          ...runs(
            node.children,
            annotations,
            node.href.length <= NOTION_TEXT_LIMIT ? node.href : url,
          ),
        );
        break;
    }
  }
  // Merge neighbours with the same style (the 2000-unit cut above never joins pieces back).
  const merged: NotionRichText[] = [];
  for (const run of out) {
    const last = merged.at(-1);
    if (
      last &&
      sameStyle(last, run) &&
      last.text.content.length + run.text.content.length <= NOTION_TEXT_LIMIT
    )
      last.text.content += run.text.content;
    else merged.push(run);
  }
  return merged;
}

/** At most 100 objects: the tail becomes one plain object, cut to 2000 units. */
function fit(list: NotionRichText[]): NotionRichText[] {
  if (list.length <= NOTION_RICH_TEXT_LIMIT) return list;
  const head = list.slice(0, NOTION_RICH_TEXT_LIMIT - 1);
  const tail = list
    .slice(NOTION_RICH_TEXT_LIMIT - 1)
    .map((run) => run.text.content)
    .join("");
  return [...head, { type: "text", text: { content: pieces(tail, NOTION_TEXT_LIMIT - 1)[0]! } }];
}

const block = (type: string, content: Record<string, unknown>): NotionBlock => ({
  object: "block",
  type,
  [type]: content,
});
const text = (nodes: Inline[]) => ({ rich_text: fit(runs(nodes)) });

function convert(source: Block): NotionBlock[] {
  switch (source.type) {
    case "paragraph":
      return [block("paragraph", text(source.children))];
    // The page title is the top heading, so "###" is a section heading and "####" a sub-heading.
    case "heading":
      return [block(source.level === 3 ? "heading_2" : "heading_3", text(source.children))];
    case "quote":
      return [block("quote", text(source.children))];
    case "list":
      return source.items.map((item) =>
        block(source.ordered ? "numbered_list_item" : "bulleted_list_item", text(item)),
      );
    case "code":
      return [
        block("code", {
          rich_text: fit(
            pieces(source.text).map((content) => ({ type: "text", text: { content } })),
          ),
          language: "plain text",
        }),
      ];
  }
}

/**
 * The content blocks for a post body: paragraphs, headings, lists, quotes and code, with bold,
 * italic, code and link annotations. At most 100 blocks: if the body is longer, the rest is
 * replaced by a last paragraph that points at the full post (`moreUrl`).
 */
export function markdownToNotionBlocks(source: string, moreUrl?: string): NotionBlock[] {
  const blocks = parseMarkdown(source).flatMap(convert);
  if (blocks.length <= NOTION_BLOCK_LIMIT) return blocks;
  const more: NotionRichText = {
    type: "text",
    text: moreUrl
      ? { content: "Read the full text on the portal.", link: { url: moreUrl } }
      : { content: "…" },
  };
  return [...blocks.slice(0, NOTION_BLOCK_LIMIT - 1), block("paragraph", { rich_text: [more] })];
}
