import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fixtureGetPost, fixtureId, fixtureListComments } from "../fixtures/portal.ts";
import { uuid } from "../../src/server/validation.ts";

const functions = vi.hoisted(() => ({ getPost: vi.fn(), listComments: vi.fn() }));
vi.mock("../../src/server/functions.ts", () => functions);

import { Route } from "../../src/routes/posts.$postId.tsx";

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
