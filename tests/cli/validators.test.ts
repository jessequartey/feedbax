import { describe, expect, it } from "vite-plus/test";
import {
  detectPackageManager,
  pageProblem,
  parseFlags,
  projectProblem,
  repoProblem,
  subdomainProblem,
  tokenProblem,
} from "../../packages/create-feedbax/src/flags.ts";
import { execCommand, parseJsonOutput } from "../../packages/create-feedbax/src/setup.ts";
import { redact } from "../../packages/create-feedbax/src/io.ts";
import { ID } from "./fakes.ts";
describe("prompt validators", () => {
  it.each(["ab", "my-feedback", "a".repeat(40)])("accepts project %s", (v) =>
    expect(projectProblem(v)).toBeUndefined(),
  );
  it.each(["", "a", "A-b", "../test", "-a", "a".repeat(41), "two words", "ab;echo"])(
    'rejects project "%s"',
    (v) => expect(projectProblem(v)).toBeTruthy(),
  );
  it.each(["team", "my-team", "a", "1team"])("accepts subdomain %s", (v) =>
    expect(subdomainProblem(v)).toBeUndefined(),
  );
  it.each(["", "team-", "-team", "TEAM", "a".repeat(64), "team.workers.dev"])(
    "rejects subdomain %s",
    (v) => expect(subdomainProblem(v)).toBeTruthy(),
  );
  it.each([
    ID,
    ID.replaceAll("-", ""),
    `https://www.notion.so/Team-${ID.replaceAll("-", "")}?pvs=4`,
    `https://team.notion.site/${ID}`,
    `https://app.notion.com/p/${ID.replaceAll("-", "")}`,
    `https://www.notion.com/Team-${ID.replaceAll("-", "")}`,
  ])("accepts page %s", (v) => expect(pageProblem(v)).toBeUndefined());
  it.each([
    "",
    "garbage",
    `https://evil.test/${ID}`,
    `https://notion.so.evil.test/${ID}`,
    `https://notion.com.evil.test/${ID}`,
    `http://notion.so/${ID}`,
    `https://notion.so/no-id`,
    `garbage${ID}`,
  ])("rejects page %s", (v) => expect(pageProblem(v)).toBeTruthy());
  it.each(["team/app", "Team/foo.bar-baz_1"])("accepts repo %s", (v) =>
    expect(repoProblem(v)).toBeUndefined(),
  );
  it.each(["", "app", "team/app/more", "https://github.com/team/app", "team /app"])(
    "rejects repo %s",
    (v) => expect(repoProblem(v)).toBeTruthy(),
  );
  it.each(["ntn_value", "github_pat_value"])("accepts token %s", (v) =>
    expect(tokenProblem(v)).toBeUndefined(),
  );
  it.each(["", " a", "a\nb", "a b"])("rejects token whitespace", (v) =>
    expect(tokenProblem(v)).toBeTruthy(),
  );
});
describe("flags", () => {
  it("parses the full CI invocation and equals syntax", () =>
    expect(
      parseFlags([
        "my-feedback",
        "--yes",
        "--template=notion-github",
        "--github-repo",
        "team/app",
        "--notion-page",
        ID,
        "--anonymous",
        "false",
        "--package-manager",
        "pnpm",
      ]),
    ).toEqual({
      name: "my-feedback",
      yes: true,
      help: false,
      version: false,
      template: "notion-github",
      githubRepo: "team/app",
      notionPage: ID,
      anonymous: false,
      packageManager: "pnpm",
    }));
  it("supports offline help, version and defaults", () => {
    expect(parseFlags([]).yes).toBe(false);
    expect(parseFlags(["--help"]).help).toBe(true);
    expect(parseFlags(["--version"]).version).toBe(true);
    expect(parseFlags(["--anonymous=true"]).anonymous).toBe(true);
  });
  it.each([
    ["--bad"],
    ["--notion-token", "secret"],
    ["--template"],
    ["--template", "other"],
    ["--anonymous", "yes"],
    ["--package-manager", "yarn"],
    ["two", "names"],
    ["--yes", "--yes"],
    ["--template=notion", "--template=notion"],
    ["--github-repo", "bad"],
    ["--notion-page", "bad"],
    ["--template", "notion", "--github-repo", "team/app"],
  ])("rejects invalid invocation %s", (...args) => expect(() => parseFlags(args)).toThrow());
  it.each([
    ["npm/12 node/v24", "npm"],
    ["pnpm/11 npm/?", "pnpm"],
    ["bun/1.3", "bun"],
    ["", "npm"],
  ])("detects %s", (value, expected) => expect(detectPackageManager(value)).toBe(expected));
  it("uses local tools with argument arrays", () => {
    expect(execCommand("npm", "wrangler", ["whoami"])).toEqual([
      "npx",
      ["--no-install", "wrangler", "whoami"],
    ]);
    expect(execCommand("pnpm", "wrangler", [])).toEqual(["pnpm", ["exec", "wrangler"]]);
    expect(execCommand("bun", "wrangler", [])).toEqual(["bunx", ["--no-install", "wrangler"]]);
  });
  it("redacts known, encoded and provider-shaped secrets", () =>
    expect(redact("sentinel a%2Fb ntn_abcd Bearer cf-token", ["sentinel", "a/b"])).toBe(
      "[redacted] [redacted] [redacted] Bearer [redacted]",
    ));
  it("parses Wrangler JSON shapes and rejects prose", () => {
    expect(parseJsonOutput('banner\n{"accounts":[{"id":"account","name":"Team"}]}')).toHaveProperty(
      "accounts",
    );
    expect(parseJsonOutput('[{"uuid":"id","name":"db"}]')).toEqual([{ uuid: "id", name: "db" }]);
    expect(() => parseJsonOutput("Not logged in")).toThrow();
  });
});
