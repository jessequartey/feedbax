import { describe, expect, it } from "vite-plus/test";
import { isPrivateHost, webhookUrlProblem } from "../../src/lib/webhook-url.ts";
import { markdownToPlainText } from "../../src/lib/markdown.ts";

describe("webhookUrlProblem", () => {
  it("accepts public https URLs", () => {
    for (const url of [
      "https://example.com/hook",
      "https://hooks.example.co.uk:8443/a?b=c",
      "https://8.8.8.8/x",
      "https://[2606:4700:4700::1111]/x",
    ])
      expect(webhookUrlProblem(url), url).toBeNull();
  });

  it("requires https outside local development", () => {
    expect(webhookUrlProblem("http://example.com/hook")).toBe("Use an https URL.");
    expect(webhookUrlProblem("ftp://example.com/hook")).toBe("Use an https URL.");
    expect(webhookUrlProblem("javascript:alert(1)")).not.toBeNull();
  });

  it("blocks private, loopback and link-local addresses in every spelling", () => {
    for (const host of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "127.1",
      "2130706433", // decimal 127.0.0.1
      "0x7f.0.0.1",
      "0",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1",
      "224.0.0.1",
      "[::1]",
      "[::]",
      "[fe80::1]",
      "[fc00::1]",
      "[fd12:3456::1]",
      "[::ffff:127.0.0.1]",
      "[::ffff:10.0.0.1]",
      "[::ffff:a9fe:a9fe]",
      "[64:ff9b::7f00:1]",
      "[2002:7f00:1::]",
      "metadata",
      "db.internal",
      "printer.local",
      "localhost.",
    ]) {
      // The URL parser turns 127.1, 0x7f.0.0.1 and 2130706433 into 127.0.0.1 first.
      expect(webhookUrlProblem(`https://${host}/hook`), host).toMatch(/private or local/);
    }
    expect(isPrivateHost("172.32.0.1")).toBe(false);
    expect(isPrivateHost("[2606:4700::1]")).toBe(false);
  });

  it("rejects credentials, whitespace, junk and over-long URLs", () => {
    expect(webhookUrlProblem("https://user:pw@example.com/")).toMatch(/username/);
    expect(webhookUrlProblem("https://example.com/a b")).toMatch(/doesn't look/);
    expect(webhookUrlProblem("https://example.com/\n")).toMatch(/doesn't look/);
    expect(webhookUrlProblem("not a url")).toMatch(/doesn't look/);
    expect(webhookUrlProblem("")).toBe("Enter a URL.");
    expect(webhookUrlProblem(42)).toBe("Enter a URL.");
    expect(webhookUrlProblem(`https://example.com/${"a".repeat(2100)}`)).toMatch(/too long/);
  });

  it("allows http and local hosts only in local development", () => {
    expect(webhookUrlProblem("http://localhost:4000/hook", true)).toBeNull();
    expect(webhookUrlProblem("http://127.0.0.1:4000/hook", true)).toBeNull();
    expect(webhookUrlProblem("https://example.com/hook", true)).toBeNull();
    expect(webhookUrlProblem("ftp://localhost/hook", true)).toBe("Use an http or https URL.");
    expect(webhookUrlProblem("http://user:pw@localhost/", true)).toMatch(/username/);
  });
});

describe("markdownToPlainText", () => {
  it("keeps the whole body as readable text", () => {
    expect(
      markdownToPlainText(
        "# Title\n\nSome **bold** and *italic* with `code` and [a link](https://x.example/a).\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n---\n\n```\nlet a = 1;\n```",
      ),
    ).toBe(
      "Title\n\nSome bold and italic with code and a link (https://x.example/a).\n\n- one\n- two\n\n1. first\n2. second\n\nquoted\n\nlet a = 1;",
    );
  });

  it("is never cut, emits no HTML and shows raw HTML as text", () => {
    const long = "word ".repeat(400).trim();
    expect(markdownToPlainText(long)).toBe(long);
    expect(markdownToPlainText("<b>hi</b> & <script>x</script>")).toBe(
      "<b>hi</b> & <script>x</script>",
    );
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText("line one\nline two")).toBe("line one\nline two");
  });
});
