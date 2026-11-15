// The rich-text editor's document, as the Markdown subset in src/lib/markdown.ts.
// ProseMirror JSON goes in and canonical Markdown comes out (and the other way). Nothing here
// imports the editor, so the conversion can be tested without a DOM and the editor chunk is the
// only place that pays for Tiptap. Marks the subset does not have (underline, strike, images,
// unsafe links) are dropped on the way out.

import { parseMarkdown, safeHref, type Block, type Inline } from "@/lib/markdown";
import { blocksToMarkdown } from "@/lib/markdown-write";

export type EditorMark = { type: string; attrs?: Record<string, unknown> };
export type EditorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: EditorMark[];
  content?: EditorNode[];
};

type Run = {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  href: string | null;
  break: boolean;
};

/** A link the editor is allowed to create. Adds https:// when the person left the scheme off. */
export function editorLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  return safeHref(withProtocol);
}

export function markdownToEditorDoc(source: string): EditorNode {
  const content = parseMarkdown(source).map(blockToNode);
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

export function editorDocToMarkdown(doc: EditorNode): string {
  const blocks: Block[] = [];
  for (const node of doc.content ?? []) {
    const block = blockFrom(node);
    if (block) blocks.push(block);
  }
  return blocksToMarkdown(blocks);
}

function blockToNode(block: Block): EditorNode {
  switch (block.type) {
    case "paragraph":
      return paragraphNode(block.children);
    case "heading": {
      const content = inlinesToNodes(block.children);
      return content.length > 0
        ? { type: "heading", attrs: { level: block.level }, content }
        : { type: "heading", attrs: { level: block.level } };
    }
    case "quote":
      return { type: "blockquote", content: quoteParagraphs(block.children) };
    case "code":
      return block.text
        ? { type: "codeBlock", content: [{ type: "text", text: block.text }] }
        : { type: "codeBlock" };
    case "list":
      return {
        type: block.ordered ? "orderedList" : "bulletList",
        ...(block.ordered ? { attrs: { start: block.start } } : {}),
        content: block.items.map((item) => ({
          type: "listItem",
          content: [paragraphNode(item)],
        })),
      };
  }
}

function paragraphNode(children: Inline[]): EditorNode {
  const content = inlinesToNodes(children);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

/** A quote is one block of inlines. A blank line inside it is a new paragraph; one break is a hard break. */
function quoteParagraphs(nodes: Inline[]): EditorNode[] {
  const groups: Inline[][] = [[]];
  let breakRun = 0;
  const flushBreaks = () => {
    const current = groups.at(-1)!;
    if (breakRun >= 2) groups.push([]);
    else if (breakRun === 1 && current.length > 0) current.push({ type: "break" });
    breakRun = 0;
  };
  for (const node of nodes) {
    if (node.type === "break") {
      breakRun += 1;
      continue;
    }
    flushBreaks();
    groups.at(-1)!.push(node);
  }
  const paragraphs = groups
    .filter((group, index, all) => group.length > 0 || all.length === 1)
    .map(paragraphNode);
  return paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }];
}

function inlinesToNodes(nodes: Inline[]): EditorNode[] {
  const out: EditorNode[] = [];
  const walk = (list: Inline[], marks: EditorMark[]) => {
    for (const node of list) {
      if (node.type === "text") pushText(out, node.text, marks);
      else if (node.type === "break") out.push({ type: "hardBreak" });
      else if (node.type === "code")
        pushText(out, node.text, [
          ...marks.filter((mark) => mark.type === "link"),
          { type: "code" },
        ]);
      else if (node.type === "strong") walk(node.children, [...marks, { type: "bold" }]);
      else if (node.type === "em") walk(node.children, [...marks, { type: "italic" }]);
      else if (node.type === "link")
        walk(node.children, [...marks, { type: "link", attrs: { href: node.href } }]);
    }
  };
  walk(nodes, []);
  return out;
}

function pushText(out: EditorNode[], text: string, marks: EditorMark[]) {
  if (!text) return;
  const normalized = marks.length > 0 ? sortMarks(marks) : undefined;
  const last = out.at(-1);
  if (last?.type === "text" && sameMarks(last.marks, normalized)) {
    last.text = `${last.text ?? ""}${text}`;
    return;
  }
  out.push(normalized ? { type: "text", text, marks: normalized } : { type: "text", text });
}

function sortMarks(marks: EditorMark[]): EditorMark[] {
  const rank: Record<string, number> = { link: 0, bold: 1, italic: 2, code: 3 };
  return [...marks].sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
}

function sameMarks(a: EditorMark[] | undefined, b: EditorMark[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((mark, index) => {
    const other = right[index];
    return other?.type === mark.type && (mark.attrs?.href ?? null) === (other.attrs?.href ?? null);
  });
}

function blockFrom(node: EditorNode): Block | null {
  switch (node.type) {
    case "paragraph": {
      const children = runsToInlines(runsFrom(node.content));
      return meaningful(children) ? { type: "paragraph", children } : null;
    }
    case "heading": {
      const level = node.attrs?.level === 4 ? 4 : 3;
      const children = flattenBreaks(runsToInlines(runsFrom(node.content)));
      return meaningful(children) ? { type: "heading", level, children } : null;
    }
    case "blockquote": {
      const children: Inline[] = [];
      for (const child of node.content ?? []) {
        // Keep hard breaks: a quote can be several lines. A new paragraph is a blank line.
        const inlines = inlinesOf(child);
        if (!meaningful(inlines)) continue;
        if (children.length > 0) children.push({ type: "break" }, { type: "break" });
        children.push(...inlines);
      }
      return meaningful(children) ? { type: "quote", children } : null;
    }
    case "codeBlock": {
      const text = literalText(node).replace(/\n$/, "");
      return text.trim() ? { type: "code", text } : null;
    }
    case "bulletList":
    case "orderedList": {
      const items: Inline[][] = [];
      for (const item of node.content ?? []) {
        if (item.type !== "listItem") continue;
        const inlines = flattenBreaks(listItemInlines(item));
        if (meaningful(inlines)) items.push(inlines);
      }
      if (items.length === 0) return null;
      const startRaw = Number(node.attrs?.start ?? 1);
      const start =
        node.type === "orderedList" && Number.isInteger(startRaw) && startRaw >= 1 ? startRaw : 1;
      return { type: "list", ordered: node.type === "orderedList", start, items };
    }
    default:
      return null;
  }
}

function listItemInlines(item: EditorNode): Inline[] {
  const out: Inline[] = [];
  for (const child of item.content ?? []) {
    const inlines = inlinesOf(child);
    if (out.length > 0 && inlines.length > 0) out.push({ type: "break" });
    out.push(...inlines);
  }
  return out;
}

function inlinesOf(node: EditorNode): Inline[] {
  if (node.type === "paragraph" || node.type === "heading")
    return runsToInlines(runsFrom(node.content));
  if (node.type === "codeBlock") {
    const text = literalText(node);
    return text ? [{ type: "code", text }] : [];
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    const out: Inline[] = [];
    for (const item of node.content ?? []) {
      if (item.type !== "listItem") continue;
      const inlines = flattenBreaks(listItemInlines(item));
      if (!meaningful(inlines)) continue;
      if (out.length > 0) out.push({ type: "break" });
      out.push(...inlines);
    }
    return out;
  }
  if (node.type === "blockquote") return (node.content ?? []).flatMap((child) => inlinesOf(child));
  return runsToInlines(runsFrom(node.content));
}

function literalText(node: EditorNode): string {
  let out = "";
  for (const child of node.content ?? []) {
    if (child.type === "hardBreak") out += "\n";
    else if (child.type === "text") out += child.text ?? "";
    else out += literalText(child);
  }
  return out;
}

function runsFrom(content: EditorNode[] | undefined): Run[] {
  const runs: Run[] = [];
  for (const node of content ?? []) {
    if (node.type === "hardBreak") {
      runs.push({ text: "", bold: false, italic: false, code: false, href: null, break: true });
      continue;
    }
    if (node.type !== "text" || !node.text) continue;
    const marks = node.marks ?? [];
    const link = marks.find((mark) => mark.type === "link");
    const hrefRaw = link?.attrs?.href;
    runs.push({
      text: node.text,
      bold: marks.some((mark) => mark.type === "bold"),
      italic: marks.some((mark) => mark.type === "italic"),
      code: marks.some((mark) => mark.type === "code"),
      href: typeof hrefRaw === "string" && hrefRaw ? hrefRaw : null,
      break: false,
    });
  }
  return runs;
}

function runsToInlines(runs: Run[]): Inline[] {
  const out: Inline[] = [];
  let buffer: Run[] = [];
  const flush = () => {
    if (buffer.length > 0) out.push(...styled(buffer));
    buffer = [];
  };
  for (const run of runs) {
    if (run.break) {
      flush();
      out.push({ type: "break" });
    } else buffer.push(run);
  }
  flush();
  return out;
}

function styled(runs: Run[]): Inline[] {
  if (runs.length === 0) return [];
  const href = runs[0]!.href;
  if (href && runs.every((run) => run.href === href)) {
    const safe = safeHref(href);
    const inner = styled(runs.map((run) => ({ ...run, href: null })));
    return safe ? [{ type: "link", href: safe, children: inner }] : inner;
  }
  if (runs.every((run) => run.code))
    return [{ type: "code", text: runs.map((run) => run.text).join("") }];
  if (runs.every((run) => run.bold))
    return [{ type: "strong", children: styled(runs.map((run) => ({ ...run, bold: false }))) }];
  if (runs.every((run) => run.italic))
    return [{ type: "em", children: styled(runs.map((run) => ({ ...run, italic: false }))) }];
  if (runs.every((run) => sameStyle(run, runs[0]!)))
    return [{ type: "text", text: runs.map((run) => run.text).join("") }];
  for (const key of [
    (run: Run) => run.href ?? "",
    (run: Run) => (run.bold ? "1" : "0"),
    (run: Run) => (run.italic ? "1" : "0"),
    (run: Run) => (run.code ? "1" : "0"),
  ]) {
    const groups = splitBy(runs, key);
    if (groups.length > 1) return groups.flatMap(styled);
  }
  return [{ type: "text", text: runs.map((run) => run.text).join("") }];
}

function sameStyle(a: Run, b: Run): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code && a.href === b.href;
}

function splitBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && key(last[0]!) === key(item)) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

/** List items and headings are one line in this subset. A hard break becomes a space. */
function flattenBreaks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type !== "break") {
      out.push(node);
      continue;
    }
    const last = out.at(-1);
    if (last?.type === "text") last.text += " ";
    else out.push({ type: "text", text: " " });
  }
  while (out[0]?.type === "text") {
    out[0].text = out[0].text.trimStart();
    if (out[0].text) break;
    out.shift();
  }
  while (out.at(-1)?.type === "text") {
    const last = out.at(-1) as { type: "text"; text: string };
    last.text = last.text.trimEnd();
    if (last.text) break;
    out.pop();
  }
  return out;
}

function meaningful(nodes: Inline[]): boolean {
  return nodes.some((node) =>
    node.type === "text"
      ? node.text.trim() !== ""
      : node.type === "break"
        ? false
        : node.type === "code"
          ? node.text.length > 0
          : meaningful(node.children),
  );
}
