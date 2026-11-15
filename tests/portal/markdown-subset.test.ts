import { describe, expect, it } from "vite-plus/test";

import {
  markdownToHtml,
  markdownToPlainText,
  markdownToText,
  parseMarkdown,
  safeHref,
  type Block,
  type Inline,
} from "../../src/lib/markdown.ts";
import {
  escapeMarkdownText,
  markdownToGitHub,
  normalizeMarkdown,
} from "../../src/lib/markdown-write.ts";

// Every anchor in the tree, and every text node, walked once.
function links(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.type === "link") out.push(node.href);
      if ("children" in node) walk(node.children);
    }
  };
  for (const block of blocks) {
    if (block.type === "list") block.items.forEach(walk);
    else if (block.type !== "code") walk(block.children);
  }
  return out;
}

describe("link policy", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "\u200bjavascript:alert(1)",
    "&#106;avascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/path",
    "/relative/path",
    "relative",
    "#fragment",
    "ftp://example.com/file",
    "https://user:pass@example.com/",
    "https://",
    "mailto:",
    "http://exa mple.com",
    `https://example.com/${"a".repeat(2000)}`,
    "",
  ])("refuses %j", (href) => {
    expect(safeHref(href)).toBeNull();
    // As a link in a body it leaves the text, never the URL, and never an anchor.
    const blocks = parseMarkdown(`[click](${href})`);
    expect(links(blocks)).toEqual([]);
  });

  it("accepts http, https and mailto, and encodes what could break a destination", () => {
    expect(safeHref("https://example.com/a?b=c#d")).toBe("https://example.com/a?b=c#d");
    expect(safeHref("HTTP://Example.com")).toBe("HTTP://Example.com");
    expect(safeHref("mailto:team@example.com")).toBe("mailto:team@example.com");
    expect(safeHref('https://example.com/"onmouseover="x')).toBe(
      "https://example.com/%22onmouseover=%22x",
    );
    expect(safeHref("https://example.com/a_(b)")).toBe("https://example.com/a_%28b%29");
    // Idempotent: a stored URL is never encoded twice.
    const once = safeHref("https://example.com/a_(b)'`<>")!;
    expect(safeHref(once)).toBe(once);
  });
});

describe("HTML injection and attribute breaking", () => {
  const attacks = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "text <b onclick=alert(1)>bold</b> text",
    "<iframe src='https://evil.example'></iframe>",
    '<a href="javascript:alert(1)">x</a>',
    "<!-- feedbax:v1:abc:def -->",
    "<svg onload=alert(1)>",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "```\n<script>alert(1)</script>\n```",
    "> <script>alert(1)</script>",
    "# <script>alert(1)</script>",
    "- <script>alert(1)</script>",
    "**<script>alert(1)</script>**",
    "[<script>alert(1)</script>](https://example.com)",
    '[x](https://example.com/" onmouseover="alert(1))',
    '[x](https://example.com/"onmouseover="alert(1))',
    "[x](https://example.com/')onfocus=alert(1)//)",
    '[a](https://a.com)[b](https://b.com" x="y)',
    "[[x](https://a.com)](https://b.com)",
    "[x](https://a.com)(https://b.com)",
    "![x](https://tracker.example/pixel.png)",
    "![x](javascript:alert(1))",
    "<https://example.com>",
    "<javascript:alert(1)>",
  ];

  it("emits only the renderer's own tags, with no event handlers or foreign attributes", () => {
    for (const source of attacks) {
      const output = markdownToHtml(source);
      const tags = output.match(/<[^>]*>/g) ?? [];
      for (const tag of tags) {
        expect(tag, source).toMatch(
          /^<\/?(p|h[34]|ul|ol|li|strong|em|code|a|br|pre|blockquote)(\s start="\d+"| href="[^"<>]*" rel="noopener nofollow ugc")?\s*\/?>$/,
        );
      }
      // Whatever the source said, no raw "<" from it survives unescaped inside text.
      expect(output.replace(/<\/?[a-z0-9]+[^<>]*>/g, ""), source).not.toMatch(/[<>]/);
    }
  });

  it("only ever links to http, https or mailto", () => {
    for (const source of attacks)
      for (const href of links(parseMarkdown(source)))
        expect(href, source).toMatch(/^(https?:\/\/|mailto:)[^\s"'<>`\\()]*$/i);
  });

  it("never turns image syntax into an image", () => {
    expect(markdownToHtml("![x](https://tracker.example/pixel.png)")).not.toContain("<img");
    expect(normalizeMarkdown("![x](https://tracker.example/p.png)")).toBe(
      "\\![x](https://tracker.example/p.png)",
    );
  });

  it("stores raw HTML as escaped text, so no reader runs it", () => {
    expect(normalizeMarkdown("<script>alert(1)</script>")).toBe("\\<script>alert(1)\\</script>");
    expect(normalizeMarkdown("<javascript:alert(1)>")).toBe("\\<javascript:alert(1)>");
    expect(normalizeMarkdown("&lt;b&gt;")).toBe("\\&lt;b\\&gt;");
    // A literal comment can never become the GitHub issue marker.
    expect(markdownToGitHub("<!-- feedbax:v1:x:y -->")).toBe("&lt;!-- feedbax:v1:x:y -->");
  });

  it("a nested link keeps the inner link only", () => {
    expect(links(parseMarkdown("[[x](https://a.com)](https://b.com)"))).toEqual(["https://a.com"]);
    expect(links(parseMarkdown("[a [b](https://b.com) c](https://a.com)"))).toEqual([
      "https://b.com",
    ]);
  });
});

describe("pathological input", () => {
  const big = (unit: string, size: number) => unit.repeat(size);
  const cases: [string, string][] = [
    ["deep emphasis", big("*a ", 6000)],
    ["deep strong", `${big("**a ", 4000)}${big("**", 4000)}`],
    ["unmatched openers", big("*_[`(", 4000)],
    ["unmatched link text", big("[a](", 5000)],
    ["bracket tower", `${big("[", 8000)}${big("]", 8000)}`],
    ["link in link in link", `${big("[a](https://a.com/", 1000)}${big(")", 1000)}`],
    ["paren tower in a link", `[a](${big("(", 10_000)}${big(")", 10_000)})`],
    ["backtick runs", Array.from({ length: 2000 }, (_, i) => "`".repeat((i % 9) + 1)).join(" ")],
    ["quote tower", big(">", 20_000)],
    ["quote lines", big("> > > a\n", 3000)],
    ["heading tower", big("#", 20_000)],
    ["list tower", big("- ", 10_000)],
    ["numbered list tower", big("1. ", 6000)],
    ["backslashes", big("\\", 20_000)],
    ["backslash lines", big("a\\\n", 8000)],
    ["spaces", `# ${big(" ", 20_000)}x${big(" ", 20_000)}`],
    ["fence tower", big("```\n", 5000)],
    ["emphasis pairs", big("*a* ", 5000)],
    ["lone surrogates", big("\ud800*a*", 3000)],
    ["nul and bidi", big("\u0000\u202e*a*", 3000)],
  ];

  it.each(cases)("parses %s in bounded time without throwing", (_name, source) => {
    const started = performance.now();
    const blocks = parseMarkdown(source);
    const markdown = normalizeMarkdown(source);
    markdownToHtml(source);
    markdownToPlainText(source);
    markdownToGitHub(source);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(Array.isArray(blocks)).toBe(true);
    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });

  it("does not recurse deeper than the nesting limit", () => {
    const depthOf = (nodes: Inline[]): number =>
      Math.max(0, ...nodes.map((node) => ("children" in node ? 1 + depthOf(node.children) : 0)));
    const source = `${big("*a ", 200)}x${big("* ", 200)}`;
    for (const block of parseMarkdown(source))
      if (block.type === "paragraph") expect(depthOf(block.children)).toBeLessThanOrEqual(4);
  });
});

// A small seeded generator over the characters that matter, so failures reproduce.
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const parts = [
    "*",
    "**",
    "_",
    "__",
    "`",
    "``",
    "[",
    "]",
    "(",
    ")",
    "\\",
    "\n",
    "\n\n",
    "> ",
    "- ",
    "1. ",
    "# ",
    "### ",
    "```\n",
    "---",
    "===",
    "<",
    ">",
    "&",
    "&amp;",
    "!",
    "@",
    "#12",
    "|",
    "~~",
    "a",
    "b c",
    " ",
    "  ",
    "https://example.com/x",
    "[t](https://example.com/p_(q))",
    "[t](javascript:alert(1))",
    "<script>",
    "snake_case",
    "é",
    "\u200b",
  ];
  return () => {
    const count = 1 + Math.floor(next() * 14);
    let out = "";
    for (let i = 0; i < count; i++) out += parts[Math.floor(next() * parts.length)];
    return out;
  };
}

describe("normalization", () => {
  it("is idempotent and keeps the render for generated input", () => {
    const make = generator(20_261_114);
    for (let i = 0; i < 4000; i++) {
      const source = make();
      const once = normalizeMarkdown(source);
      expect(normalizeMarkdown(once), JSON.stringify(source)).toBe(once);
      // The stored form renders exactly like the original wherever the original was parsed.
      expect(markdownToHtml(once), JSON.stringify(source)).toBe(markdownToHtml(source));
    }
  });

  it("keeps ordinary formatting, and canonical form for the editor", () => {
    expect(
      normalizeMarkdown(
        "# Big\n\n__bold__ and _it_ and `x`\n\n* a\n* b\n\n3) c\n4) d\n\n> q\n\n```js\nlet a;\n```",
      ),
    ).toBe(
      "### Big\n\n**bold** and *it* and `x`\n\n- a\n- b\n\n3. c\n4. d\n\n> q\n\n```\nlet a;\n```",
    );
    expect(normalizeMarkdown("a\r\nb\r\n\r\n\r\nc  ")).toBe("a\nb\n\nc");
  });

  it("drops control and bidi characters and what is empty after sanitizing", () => {
    expect(normalizeMarkdown("a\u0000b\u202ec")).toBe("abc");
    expect(normalizeMarkdown("[](javascript:alert(1))")).toBe("");
    expect(normalizeMarkdown("   \n\n  ")).toBe("");
    expect(normalizeMarkdown("```\n```")).toBe("");
  });

  it("keeps inline code that contains backticks and fences that contain fences", () => {
    expect(normalizeMarkdown("`` a`b ``")).toBe("``a`b``");
    expect(normalizeMarkdown("````\n```\nx\n```\n````")).toBe("````\n```\nx\n```\n````");
  });

  it("escapes a literal string so it can never format", () => {
    const text = "# not a heading\n- not a list\n*star* `tick` [x](https://a.com) <b>";
    const escaped = escapeMarkdownText(text);
    expect(markdownToText(escaped, 500)).toBe(text.replace(/\s+/g, " "));
    expect(links(parseMarkdown(escaped))).toEqual([]);
  });
});

describe("plain text written before this release renders the same", () => {
  const same = (text: string) => {
    expect(markdownToPlainText(text)).toBe(text.trim());
    expect(markdownToText(text, 10_000)).toBe(text.replace(/\s+/g, " ").trim());
    const html = markdownToHtml(text);
    expect(html).not.toMatch(/<(strong|em|code|a|h3|h4|ul|ol|blockquote)[\s>]/);
  };

  it.each([
    "The login button is broken on mobile.",
    "It crashes when I click save.\nHappens every time.\nOn Safari 17.",
    "snake_case_names and some_other_thing stay as they are",
    "Cost is 5 * 3 = 15, and 2*3 stays",
    "Use the file *.js or *.ts here",
    "Price: $5 (about 4 euros) [approx]",
    "Email me at jane@example.com or visit https://example.com/a_b_c?x=1&y=2",
    "Why does <div> not close? Also a < b and b > a.",
    "100% sure #1 priority, #12 is related",
    "Steps:\nfirst\nsecond\nthird",
    "What about C:\\Users\\me\\file.txt?",
    "Hello!!! Anyone??? ... 1. maybe. 2) not",
    "Hyphen-ated and under_scored and tilde~ and caret^",
  ])("%j", same);

  it("keeps single line breaks and indentation", () => {
    const html = markdownToHtml("one\ntwo");
    expect(html).toBe("<p>one<br />two</p>");
    expect(parseMarkdown("a\n   b")[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "a" }, { type: "break" }, { type: "text", text: "   b" }],
    });
  });
});

describe("plain text output", () => {
  it("gives readable text with structure and link URLs", () => {
    const source =
      "## Heading\n\nSome **bold** and [a link](https://example.com/x) and [https://a.com](https://a.com).\n\n- one\n- two\n\n2. x\n3. y\n\n> quoted\n\n```\ncode here\n```";
    expect(markdownToPlainText(source)).toBe(
      "Heading\n\nSome bold and a link (https://example.com/x) and https://a.com.\n\n- one\n- two\n\n2. x\n3. y\n\nquoted\n\ncode here",
    );
    expect(markdownToPlainText("[me](mailto:me@example.com)")).toBe("me (me@example.com)");
    expect(markdownToPlainText("")).toBe("");
  });

  it("gives one cut line for excerpts", () => {
    expect(markdownToText("**Hi** [there](https://a.com)\n\n- x", 100)).toBe("Hi there x");
    expect(markdownToText("a".repeat(300), 180)).toBe(`${"a".repeat(180)}…`);
  });
});

describe("GitHub form", () => {
  it("passes formatting through and neutralizes everything that notifies or injects", () => {
    const out = markdownToGitHub(
      "Hi @octocat and @org/team, see #12, owner/repo#34 and GH-56.\n\n**bold** <script>alert(1)</script> &amp; <!-- hidden --> a|b ~~x~~\n\n[ok](https://example.com) [bad](javascript:alert(1)) ![i](https://x.com/i.png)\n\n- @everyone\n\n> @mod\n\n```\n@code <b> #1\n```\n\n`@inline`",
    );
    expect(out).toContain("@\u200boctocat");
    expect(out).toContain("@\u200borg/team");
    expect(out).toContain("\\#12");
    expect(out).toContain("owner/repo\\#34");
    expect(out).toContain("GH\\-56");
    expect(out).toContain("**bold** &lt;script>alert(1)&lt;/script> &amp;amp; &lt;!-- hidden -->");
    expect(out).toContain("a\\|b \\~\\~x\\~\\~");
    expect(out).toContain("[ok](https://example.com) bad \\![i](https://x.com/i.png)");
    expect(out).toContain("- @\u200beveryone");
    expect(out).toContain("> @\u200bmod");
    // Code is left exactly as written: GitHub never mentions or renders inside it.
    expect(out).toContain("```\n@code <b> #1\n```");
    expect(out).toContain("`@inline`");
    const outsideCode = out.replace(/```[\s\S]*?```|`[^`]*`/g, "");
    expect(outsideCode).not.toMatch(/(^|[^\u200b])@[a-z]/i);
  });
});
