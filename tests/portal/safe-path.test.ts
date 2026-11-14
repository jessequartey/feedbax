import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Route as SignupRoute } from "../../src/routes/_portal.signup.tsx";
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

it.each([
  ["/submit", "/submit"],
  ["//evil.example", undefined],
])("signup client compatibility redirect sanitizes %s", async (to, expected) => {
  const root = createRootRoute();
  Object.assign(SignupRoute.options, {
    id: "/signup",
    path: "/signup",
    getParentRoute: () => root,
  });
  const login = createRoute({ getParentRoute: () => root, path: "/login" });
  const router = createRouter({
    origin: "http://localhost",
    routeTree: root.addChildren([SignupRoute, login]),
    history: createMemoryHistory({ initialEntries: [`/signup?${new URLSearchParams({ to })}`] }),
    isServer: false,
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/login");
  expect(router.state.location.search.to).toBe(expected);
});
