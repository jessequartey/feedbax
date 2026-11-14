import { describe, expect, it } from "vite-plus/test";

import { loginHref, safeRelativePath } from "../../src/components/portal/safe-path.ts";

describe("safeRelativePath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeRelativePath("/submit")).toBe("/submit");
    expect(safeRelativePath("/posts/abc?x=1#c")).toBe("/posts/abc?x=1#c");
    expect(safeRelativePath("/?status=planned&sort=top")).toBe("/?status=planned&sort=top");
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil",
    "",
    "/a\nb",
    "/login",
    "/signup?to=/x",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeRelativePath(input)).toBe("/");
  });

  it("rejects non-strings", () => {
    expect(safeRelativePath(undefined)).toBe("/");
    expect(safeRelativePath(42)).toBe("/");
  });

  it("builds /login?to= links", () => {
    expect(loginHref("/submit")).toBe("/login?to=%2Fsubmit");
    expect(loginHref("/posts/1?a=b")).toBe("/login?to=%2Fposts%2F1%3Fa%3Db");
    expect(loginHref("https://evil.example")).toBe("/login");
    expect(loginHref("/")).toBe("/login");
  });
});
