import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fixtureGetPost, fixtureId, fixtureListComments } from "../fixtures/portal.ts";
import { uuid } from "../../src/server/validation.ts";

const functions = vi.hoisted(() => ({
  getPost: vi.fn(),
  listComments: vi.fn(),
  getViewer: vi.fn(),
  listPosts: vi.fn(),
  listMyPosts: vi.fn(),
  getRoadmap: vi.fn(),
}));
vi.mock("../../src/server/functions.ts", () => functions);

import { Route as RootRoute } from "../../src/routes/__root.tsx";
import { Route as BoardRoute } from "../../src/routes/_portal.index.tsx";
import { Route as RoadmapRoute } from "../../src/routes/_portal.roadmap.tsx";
import { Route as MyFeedbackRoute } from "../../src/routes/_portal.my-feedback.tsx";
import { Route as PortalRoute } from "../../src/routes/_portal.tsx";
import { pageTitle } from "../../src/components/portal/route-head.ts";
import { viewerOf } from "./helpers.tsx";
import { Route } from "../../src/routes/_portal.posts.$postId.tsx";

async function load(path: string) {
  const root = createRootRoute();
  const post = Route;
  Object.assign(post.options, {
    id: "/posts/$postId",
    path: "/posts/$postId",
    getParentRoute: () => root,
  });
  const router = createRouter({
    routeTree: root.addChildren([post]),
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  });
  await router.load();
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  functions.getViewer.mockResolvedValue(viewerOf(null));
  functions.getPost.mockImplementation(({ data }) => fixtureGetPost(uuid(data.id)));
  functions.listComments.mockImplementation(({ data }) =>
    fixtureListComments(uuid(data.postId), data.page),
  );
});

describe("post route", () => {
  it.each(["not-a-uuid", "123", "00000000-0000-0000-0000-000000000000"])(
    "returns 404 before requesting a malformed post ID: %s",
    async (id) => {
      const router = await load(`/posts/${id}`);
      expect(router.state.matches.at(-1)?.status).toBe("notFound");
      expect(functions.getPost).not.toHaveBeenCalled();
      expect(functions.listComments).not.toHaveBeenCalled();
    },
  );

  it("loads a valid post and its comments", async () => {
    const id = fixtureId(1);
    const router = await load(`/posts/${id}`);
    expect(router.state.matches.at(-1)?.status).toBe("success");
    expect(functions.getPost).toHaveBeenCalledWith({ data: { id } });
    expect(functions.listComments).toHaveBeenCalledWith({ data: { postId: id } });
  });
});

it("portal CSR skips viewer and post loaders on the server and runs them for the client deep link", async () => {
  const post = Route;
  Object.assign(PortalRoute.options, { id: "/_portal", getParentRoute: () => RootRoute });
  Object.assign(post.options, {
    id: "/posts/$postId",
    path: "/posts/$postId",
    getParentRoute: () => PortalRoute,
  });
  for (const isServer of [true, false]) {
    vi.clearAllMocks();
    const router = createRouter({
      origin: "http://localhost",
      routeTree: RootRoute.addChildren([PortalRoute.addChildren([post])]),
      history: createMemoryHistory({ initialEntries: [`/posts/${fixtureId(1)}`] }),
      isServer,
    });
    await router.load();
    if (isServer) {
      expect(functions.getViewer).not.toHaveBeenCalled();
      expect(functions.getPost).not.toHaveBeenCalled();
      expect(functions.listComments).not.toHaveBeenCalled();
    } else {
      expect(functions.getViewer).toHaveBeenCalledOnce();
      expect(functions.getPost).toHaveBeenCalledWith({ data: { id: fixtureId(1) } });
      expect(functions.listComments).toHaveBeenCalledWith({ data: { postId: fixtureId(1) } });
      expect(router.state.matches.at(-1)?.status).toBe("success");
    }
  }
});

it("document root is data-free and titles use only the portal loader", () => {
  expect(RootRoute.options.loader).toBeUndefined();
  expect(pageTitle(undefined, "Roadmap")).toEqual({ meta: [{ title: "Roadmap · Feedbax" }] });
  expect(
    pageTitle(
      [
        { routeId: "__root__", loaderData: viewerOf(null, { name: "Wrong" }) },
        { routeId: "/_portal", loaderData: viewerOf(null, { name: "My product" }) },
      ],
      "Roadmap",
    ),
  ).toEqual({ meta: [{ title: "Roadmap · My product" }] });
});

it.each([
  ["/", BoardRoute, "listPosts"],
  ["/roadmap", RoadmapRoute, "getRoadmap"],
  ["/my-feedback", MyFeedbackRoute, "listMyPosts"],
] as const)(
  "portal client deep link %s runs its viewer and page RPCs",
  async (path, child, name) => {
    Object.assign(PortalRoute.options, { id: "/_portal", getParentRoute: () => RootRoute });
    Object.assign(child.options, { id: path, path, getParentRoute: () => PortalRoute });
    functions[name].mockResolvedValue({});
    for (const isServer of [true, false]) {
      vi.clearAllMocks();
      const router = createRouter({
        origin: "http://localhost",
        routeTree: RootRoute.addChildren([PortalRoute.addChildren([child])]),
        history: createMemoryHistory({ initialEntries: [path] }),
        isServer,
      });
      await router.load();
      expect(functions.getViewer).toHaveBeenCalledTimes(isServer ? 0 : 1);
      expect(functions[name]).toHaveBeenCalledTimes(isServer ? 0 : 1);
      if (!isServer) expect(router.state.matches.at(-1)?.status).toBe("success");
    }
  },
);
