// Writing the restricted subset back to Markdown. Split from markdown.ts so the board, which
// only parses, does not download the writer. The editor chunk and the server import this.
// `isAlnum` and the punctuation set match the parser; they are copied so this file does not
// import them at runtime (that would cycle through the parser module).

import { parseMarkdown, type Block, type Inline } from "./markdown.ts";

const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const isAlnum = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

type Target = "storage" | "github";

function escapeText(text: string, target: Target): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const prev = text[i - 1];
    const next = text[i + 1];
    switch (char) {
      case "\\":
        out += next === undefined || PUNCTUATION.includes(next) ? "\\\\" : "\\";
        break;
      case "*":
      case "`":
      case "[":
      case "]":
        out += `\\${char}`;
        break;
      case "_":
        out += isAlnum(prev) && isAlnum(next) ? char : "\\_";
        break;
      case "<":
        out +=
          target === "github"
            ? "&lt;"
            : next !== undefined && /[A-Za-z/!?]/.test(next)
              ? "\\<"
              : char;
        break;
      case "&":
        out +=
          target === "github" ? "&amp;" : /^#?\w+;/.test(text.slice(i + 1, i + 12)) ? "\\&" : char;
        break;
      case "@":
        // A zero-width space stops GitHub from notifying whoever the name belongs to.
        out += target === "github" ? "@\u200b" : char;
        break;
      case "#":
        out += target === "github" && next !== undefined && /\d/.test(next) ? "\\#" : char;
        break;
      case "-":
        out +=
          target === "github" &&
          next !== undefined &&
          /\d/.test(next) &&
          /gh$/i.test(text.slice(0, i))
            ? "\\-"
            : char;
        break;
      case "|":
      case "~":
        out += target === "github" ? `\\${char}` : char;
        break;
      default:
        out += char;
    }
  }
  return out;
}

/** Constructs that would start a block if a line began with them. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^( {0,3})(#{1,6}(?=[ \t]|$)|[>+=~|-])/u, "$1\\$2")
    .replace(/^( {0,3}\d{1,9})([.)])(?=[ \t]|$)/u, "$1\\$2");
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad =
    text.startsWith("`") ||
    text.endsWith("`") ||
    (text.startsWith(" ") && text.endsWith(" ") && text.trim());
  return pad ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

const isEmphasis = (node: Inline | undefined) => node?.type === "strong" || node?.type === "em";

function writeInlines(nodes: Inline[], target: Target, inStrong = false): string {
  let out = "";
  let lineStart = true;
  nodes.forEach((node, index) => {
    let piece: string;
    switch (node.type) {
      case "text": {
        piece = escapeText(node.text, target);
        // "!" right before a link would turn it into an image elsewhere.
        if (nodes[index + 1]?.type === "link" && piece.endsWith("!"))
          piece = `${piece.slice(0, -1)}\\!`;
        if (lineStart) piece = escapeLineStart(piece);
        break;
      }
      case "break":
        out += "\n";
        lineStart = true;
        return;
      case "code":
        piece = codeSpan(node.text);
        break;
      case "strong": {
        const mark = isEmphasis(nodes[index - 1]) ? "__" : "**";
        piece = `${mark}${writeInlines(node.children, target, true)}${mark}`;
        break;
      }
      case "em": {
        const inner = writeInlines(node.children, target, true);
        const mark =
          inStrong || isEmphasis(nodes[index - 1]) || node.children.some((c) => c.type === "strong")
            ? "_"
            : "*";
        piece = `${mark}${inner}${mark}`;
        break;
      }
      case "link":
        piece = `[${writeInlines(node.children, target, true)}](${node.href})`;
        break;
    }
    if (piece) lineStart = false;
    out += piece;
  });
  return out;
}

function writeBlock(block: Block, target: Target): string {
  switch (block.type) {
    case "paragraph":
      return writeInlines(block.children, target);
    case "heading":
      return `${"#".repeat(block.level)} ${writeInlines(block.children, target).replace(/(^|[ \t])(#+)$/u, "$1\\$2")}`;
    case "list":
      return block.items
        .map(
          (item, index) =>
            `${block.ordered ? `${block.start + index}.` : "-"} ${writeInlines(item, target)}`,
        )
        .join("\n");
    case "quote":
      return writeInlines(block.children, target)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "code": {
      const longest = Math.max(0, ...(block.text.match(/`+/g) ?? []).map((run) => run.length));
      const fence = "`".repeat(Math.max(3, longest + 1));
      return `${fence}\n${block.text}\n${fence}`;
    }
  }
}

/** The same content with every inline formatting node flattened to literal text. */
function literalBlock(block: Block, oneLine: boolean): Block | null {
  const flat = (nodes: Inline[]): Inline[] => {
    const out: Inline[] = [];
    const push = (text: string) => {
      const last = out.at(-1);
      if (last?.type === "text") last.text += text;
      else out.push({ type: "text", text });
    };
    const walk = (list: Inline[]) => {
      for (const node of list) {
        if (node.type === "text" || node.type === "code") push(node.text);
        else if (node.type === "break") {
          if (oneLine) push(" ");
          else out.push({ type: "break" });
        } else walk(node.children);
      }
    };
    walk(nodes);
    const first = out[0];
    if (first?.type === "text") first.text = first.text.trimStart();
    for (let i = 0; i < out.length; i++) {
      const node = out[i]!;
      if (node.type === "text" && out[i + 1]?.type !== "text") node.text = node.text.trimEnd();
    }
    return out;
  };
  switch (block.type) {
    case "paragraph":
    case "quote":
    case "heading":
      return { ...block, children: flat(block.children) };
    case "list":
      return { ...block, items: block.items.map(flat) };
    case "code":
      return null;
  }
}

/**
 * Stored Markdown for a tree that is already parsed (the rich-text editor builds one).
 * Canonical: writing it twice changes nothing, and it renders like the tree.
 */
export function blocksToMarkdown(blocks: readonly Block[]): string {
  return normalizeMarkdown(blocks.map((block) => writeBlock(block, "storage")).join("\n\n"));
}

/**
 * The canonical stored form of `source`. Every character that is not formatting is escaped, so
 * the editor, GitHub and an email client read it the same way. Normalizing twice changes nothing.
 */
export function normalizeMarkdown(source: string): string {
  const parts: string[] = [];
  for (const block of parseMarkdown(source)) {
    const text = writeBlock(block, "storage");
    if (JSON.stringify(parseMarkdown(text)) === JSON.stringify([block])) {
      parts.push(text);
      continue;
    }
    for (const oneLine of [false, true]) {
      const literal = literalBlock(block, oneLine);
      const fallback = literal ? writeBlock(literal, "storage") : null;
      if (
        literal &&
        fallback &&
        JSON.stringify(parseMarkdown(fallback)) === JSON.stringify([literal])
      ) {
        parts.push(fallback);
        break;
      }
    }
  }
  return parts.join("\n\n");
}

/** A literal string as Markdown that renders as exactly that string (one paragraph). */
export function escapeMarkdownText(text: string): string {
  return text
    .split("\n")
    .map((line) => escapeLineStart(escapeText(line.trim(), "storage")))
    .join("\n");
}

/**
 * The body of a GitHub issue: stored Markdown with raw HTML escaped and @mentions and #refs
 * neutralized. Nothing else changes.
 */
export function markdownToGitHub(source: string): string {
  return parseMarkdown(source)
    .map((block) => writeBlock(block, "github"))
    .join("\n\n");
}
