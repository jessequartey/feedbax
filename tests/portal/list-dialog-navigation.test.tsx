import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  listDialogOptions,
  parseDialogSearch,
} from "../../src/components/portal/list-dialog-navigation.ts";
import { parseBoardSearch, parseRoadmapSearch } from "../../src/components/portal/portal-search.ts";
import { PostList } from "../../src/components/portal/post-row.tsx";
import { NewPostButton } from "../../src/components/portal/post-browser.tsx";
import { fixtureId, fixtureListPosts } from "../fixtures/portal.ts";
import { renderPage, viewerOf } from "./helpers.tsx";

function setup(path: string) {
  const root = createRootRoute();
  const loader = vi.fn(() => ({ items: [], total: 40 }));
  const board = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
      ...parseBoardSearch(search),
      ...parseDialogSearch(search),
    }),
    loaderDeps: ({ search }) => parseBoardSearch(search),
    loader,
  });
  const roadmap = createRoute({
    getParentRoute: () => root,
    path: "/roadmap",
    validateSearch: (search: Record<string, unknown>) => ({
      ...parseRoadmapSearch(search),
      ...parseDialogSearch(search),
    }),
    loaderDeps: ({ search }) => parseRoadmapSearch(search),
    loader,
  });
  const post = createRoute({ getParentRoute: () => root, path: "/posts/$postId" });
  const submit = createRoute({ getParentRoute: () => root, path: "/submit" });
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({
    origin: "http://localhost",
    routeTree: root.addChildren([board, roadmap, post, submit]),
    history,
    isServer: false,
  });
  // RouterProvider normally subscribes to history; these tests exercise the router without a DOM.
  const unsubscribe = history.subscribe(() => {
    void router.load();
  });
  return { router, loader, history, unsubscribe };
}

describe("list route masking", () => {
  it.each(["/?q=feedback&sort=new&page=2&category=bug", "/roadmap?q=feedback&category=bug"])(
    "retains %s and shows the canonical post URL, including Back/Forward and reload",
    async (path) => {
      const { router, loader, history, unsubscribe } = setup(path);
      try {
        await router.load();
        const before = router.state.location.href;
        const search = router.state.location.search;
        const options = listDialogOptions(router.state.location, fixtureId(1))!;
        await router.navigate(options);
        expect(history.location.pathname).toBe(`/posts/${fixtureId(1)}`);
        expect(history.location.search).toBe("");
        expect(router.state.location.pathname).toBe(path.split("?")[0]);
        expect(router.state.location.search).toEqual({ ...search, dialog: fixtureId(1) });
        expect(loader).toHaveBeenCalledOnce();
        expect(router.state.matches.at(-1)?.loaderData).toEqual({ items: [], total: 40 });
        history.back();
        await router.load();
        expect(router.state.location.href).toBe(before);
        expect(router.state.location.maskedLocation).toBeUndefined();
        history.forward();
        await router.load();
        expect(router.state.location.search.dialog).toBe(fixtureId(1));
        // Reload carries history state but uses a new router instance: unmaskOnReload is essential.
        const reloaded = setup(history.location.href);
        try {
          reloaded.history.replace(history.location.href, history.location.state);
          await reloaded.router.load();
          expect(reloaded.router.state.location.pathname).toBe(`/posts/${fixtureId(1)}`);
          expect(reloaded.router.state.location.maskedLocation).toBeUndefined();
          expect(reloaded.loader).not.toHaveBeenCalled();
        } finally {
          reloaded.unsubscribe();
        }
      } finally {
        unsubscribe();
      }
    },
  );

  it.each(["/?sort=new&page=2", "/roadmap?category=bug"])(
    "opens submit from %s and switches to the full page on the same URL",
    async (path) => {
      const { router, history, loader, unsubscribe } = setup(path);
      try {
        await router.load();
        await router.navigate(listDialogOptions(router.state.location, "submit")!);
        expect(history.location.href).toBe("/submit");
        expect(router.state.location.search.dialog).toBe("submit");
        expect(loader).toHaveBeenCalledOnce();
        await router.navigate({ to: "/submit", replace: true });
        expect(router.state.location.pathname).toBe("/submit");
        expect(router.state.location.maskedLocation).toBeUndefined();
        history.back();
        await router.load();
        expect(router.state.location.href).toBe(path);
      } finally {
        unsubscribe();
      }
    },
  );

  it("keeps other routes as full-page links and rejects invalid dialog state", () => {
    expect(listDialogOptions({ pathname: "/my-feedback", search: {} }, fixtureId(1))).toBeNull();
    for (const dialog of [null, 1, {}, "bad-id", "00000000-0000-0000-0000-000000000000"])
      expect(parseDialogSearch({ dialog })).toEqual({});
    expect(parseDialogSearch({ dialog: "submit" })).toEqual({ dialog: "submit" });
    expect(parseDialogSearch({ dialog: fixtureId(1) })).toEqual({ dialog: fixtureId(1) });
  });

  it("renders canonical anchor hrefs so new tabs and copied links use the full page", async () => {
    const post = fixtureListPosts({ limit: 1 }).items[0]!;
    const html = await renderPage(
      <>
        <PostList posts={[post]} />
        <NewPostButton />
      </>,
      viewerOf(null),
    );
    expect(html).toContain(`href="/posts/${post.id}"`);
    expect(html).toContain('href="/submit"');
    expect(html).not.toContain("?dialog=");
  });
});
