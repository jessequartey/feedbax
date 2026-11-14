import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import config from "../../feedbax.config.ts";
import { createAuth, viewerUser } from "../../src/server/auth.ts";
import { form, mintToken } from "./helpers.ts";
import { createPostForUser, getPostDetail } from "../../src/server/posts.ts";
import { setVoteForUser } from "../../src/server/votes.ts";
import { addCommentForUser, listCommentPage } from "../../src/server/comments.ts";

beforeEach(resetEnv);
const enabled = { ...config, auth: { anonymous: true } };
const request = (path: string, body: unknown, cookie?: string) =>
  new Request(`${env.PORTAL_URL}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: env.PORTAL_URL,
      "cf-connecting-ip": "192.0.2.2",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
it("anonymous off denies session creation, signed-out writes, and existing anonymous sessions", async () => {
  expect((await createAuth().handler(request("sign-in/anonymous", {}))).status).toBe(404);
  await expect(createPostForUser(form(), null)).rejects.toMatchObject({ code: "unauthenticated" });
  const response = await createAuth(enabled).handler(request("sign-in/anonymous", {}));
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const viewer = await viewerUser(new Headers({ cookie }), enabled);
  await expect(createPostForUser(form(), viewer)).rejects.toMatchObject({ code: "forbidden" });
  expect((await env.DB.prepare("SELECT count(*) AS n FROM posts").first<{ n: number }>())!.n).toBe(
    0,
  );
});
it.each(["sign-up/email", "sign-in/email"])(
  "upgrades anonymous content on %s and merges duplicate votes before deleting the anonymous user",
  async (path) => {
    const auth = createAuth(enabled);
    const target =
      path === "sign-in/email"
        ? await auth.handler(
            request("sign-up/email", {
              email: "ada@example.com",
              name: "Ada",
              password: "a long test password",
            }),
          )
        : null;
    const targetCookie = target?.headers.get("set-cookie")!.split(";")[0];
    const targetViewer = targetCookie
      ? await viewerUser(new Headers({ cookie: targetCookie }), enabled)
      : null;
    const anon = await auth.handler(request("sign-in/anonymous", {}));
    expect(anon.status).toBe(200);
    const cookie = anon.headers.get("set-cookie")!.split(";")[0];
    const anonymous = (await viewerUser(new Headers({ cookie }), enabled))!;
    expect(anonymous.kind).toBe("anonymous");
    const data = form(),
      postId = data.get("id") as string;
    await createPostForUser(data, anonymous, enabled);
    await addCommentForUser(
      { id: crypto.randomUUID(), postId, body: "Anonymous comment" },
      anonymous,
      enabled,
    );
    await setVoteForUser({ postId, voted: true }, anonymous, enabled);
    if (targetViewer) await setVoteForUser({ postId, voted: true }, targetViewer, enabled);
    const response = await auth.handler(
      request(
        path,
        { email: "ada@example.com", name: "Ada", password: "a long test password" },
        cookie,
      ),
    );
    expect(response.status).toBe(200);
    const upgraded = (await viewerUser(
      new Headers({ cookie: response.headers.get("set-cookie")!.split(";")[0] }),
      enabled,
    ))!;
    expect(upgraded.kind).toBe("account");
    expect(upgraded.id).not.toBe(anonymous.id);
    expect(await getPostDetail(postId, upgraded)).toMatchObject({
      author: { id: upgraded.id, name: "Ada", anonymous: false },
      votes: 1,
      viewerHasVoted: true,
    });
    expect((await listCommentPage({ postId })).items[0].author.id).toBe(upgraded.id);
    expect(
      await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(anonymous.id).first(),
    ).toBeNull();
  },
);
it("reading a signed-out viewer creates no anonymous account", async () => {
  expect(await viewerUser(new Headers(), enabled)).toBeNull();
  expect(await env.DB.prepare("SELECT count(*) AS n FROM user").first()).toEqual({ n: 0 });
});

it("limits anonymous session creation to five per minute per Cloudflare IP", async () => {
  const auth = createAuth(enabled);
  for (let i = 0; i < 5; i++)
    expect((await auth.handler(request("sign-in/anonymous", {}))).status).toBe(200);
  expect((await auth.handler(request("sign-in/anonymous", {}))).status).toBe(429);
});

it("transfers anonymous content when the browser signs in through a host link", async () => {
  const auth = createAuth(enabled);
  const response = await auth.handler(request("sign-in/anonymous", {}));
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const anonymous = (await viewerUser(new Headers({ cookie }), enabled))!;
  const data = form(),
    postId = data.get("id") as string;
  await createPostForUser(data, anonymous, enabled);
  const signedIn = await auth.handler(
    new Request(`${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`, {
      method: "POST",
      headers: { cookie, origin: env.PORTAL_URL },
    }),
  );
  expect(signedIn.status).toBe(302);
  const host = (await viewerUser(
    new Headers({ cookie: signedIn.headers.get("set-cookie")!.split(";")[0] }),
    enabled,
  ))!;
  expect(host.kind).toBe("host");
  expect((await getPostDetail(postId, host)).author.id).toBe(host.id);
  expect(
    await env.DB.prepare("SELECT id FROM user WHERE id = ?").bind(anonymous.id).first(),
  ).toBeNull();
});

it("disables anonymous deletion without revoking an active session that owns feedback", async () => {
  const auth = createAuth(enabled);
  const initial = await auth.handler(request("sign-in/anonymous", {}));
  const cookie = initial.headers.get("set-cookie")!.split(";")[0];
  const user = (await viewerUser(new Headers({ cookie }), enabled))!;
  await createPostForUser(form(), user, enabled);
  const response = await auth.handler(request("delete-anonymous-user", {}, cookie));
  expect(response.status).toBe(400);
  expect(await viewerUser(new Headers({ cookie }), enabled)).toMatchObject({ id: user.id });
});
it("an anonymous write racing cleanup cannot burn SSO and prevent the cookie redirect", async () => {
  const { vi } = await import("vite-plus/test");
  const auth = createAuth(enabled);
  const initial = await auth.handler(request("sign-in/anonymous", {}));
  const cookie = initial.headers.get("set-cookie")!.split(";")[0];
  const user = (await viewerUser(new Headers({ cookie }), enabled))!;
  const data = form();
  await createPostForUser(data, user, enabled);
  const adapter = (await auth.$context).internalAdapter;
  const remove = adapter.deleteUser.bind(adapter);
  const deletion = vi.spyOn(adapter, "deleteUser").mockImplementation(async (id) => {
    if (id === user.id) await createPostForUser(form(), user, enabled);
    return remove(id);
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`;
    let response = await auth.handler(new Request(url, { headers: { cookie } }));
    if (response.status === 200) {
      expect((await getPostDetail(data.get("id") as string, user)).author.id).toBe(user.id);
      response = await auth.handler(
        new Request(url, {
          method: "POST",
          headers: {
            cookie,
            origin: env.PORTAL_URL,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "",
        }),
      );
    }
    expect(response.status).toBe(302);
    const host = await viewerUser(
      new Headers({ cookie: response.headers.get("set-cookie")!.split(";")[0] }),
      enabled,
    );
    expect(host?.kind).toBe("host");
    expect((await getPostDetail(data.get("id") as string, host)).author.id).toBe(host!.id);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM posts WHERE author_id = ?")
        .bind(user.id)
        .first(),
    ).toEqual({ n: 1 });
  } finally {
    deletion.mockRestore();
    log.mockRestore();
  }
});
