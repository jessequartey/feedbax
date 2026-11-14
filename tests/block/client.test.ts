import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import {
  createTokenGetter,
  describeSubmitError,
  FeedbaxError,
  normalizePortalUrl,
  signInUrl,
  submitFeedback,
} from "../../registry/feedbax-feedback/lib/client.ts";
import { mintFeedbaxToken } from "../../registry/feedbax-feedback/lib/token.server.ts";
import { startStubPortal, type StubPortal } from "./stub-portal.ts";

const { secret } = JSON.parse(
  readFileSync(new URL("../fixtures/host-tokens.json", import.meta.url), "utf8"),
) as { secret: string };
const HOST = "http://localhost:5300";
const PNG = new Blob([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")], {
  type: "image/png",
});
const ID = "11111111-1111-4111-8111-111111111111";

let portal: StubPortal;
beforeAll(async () => {
  portal = await startStubPortal({ hostOrigin: HOST, secret });
});
afterAll(() => portal.close());
beforeEach(() => portal.reset());
afterEach(() => vi.unstubAllGlobals());

let tokensIssued = 0;
const getToken = async () => {
  tokensIssued++;
  return {
    token: await mintFeedbaxToken({ secret, user: { id: "host-user-1", name: "Ada Lovelace" } }),
  };
};
const draft = (over: Partial<Parameters<typeof submitFeedback>[0]> = {}) => ({
  portalUrl: portal.url,
  getToken,
  id: ID,
  title: "Button does nothing",
  body: "Clicking save has no effect.",
  category: "bug" as const,
  images: [PNG],
  ...over,
});
beforeEach(() => {
  tokensIssued = 0;
});

describe("submitFeedback: request shape", () => {
  test("one multipart POST with a bearer token, credentials omitted, and the fields the portal expects", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await submitFeedback(draft());
    expect(result.postId).toBe(ID);

    const urlOf = (input: Parameters<typeof fetch>[0]) =>
      input instanceof Request ? input.url : String(input);
    const calls = spy.mock.calls.filter(([url]) => urlOf(url).includes("/api/posts"));
    expect(calls).toHaveLength(1);
    const [url, init = {}] = calls[0];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(urlOf(url)).toBe(`${portal.url}/api/posts`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.mode).toBe("cors");
    expect(headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    // Content-Type must be left to the browser: it carries the multipart boundary.
    expect(Object.keys(init.headers as object).map((k) => k.toLowerCase())).not.toContain(
      "content-type",
    );

    const form = init.body as FormData;
    expect([...new Set(form.keys())].sort()).toEqual(["body", "category", "id", "image", "title"]);
    expect(form.get("id")).toBe(ID);
    expect(form.get("category")).toBe("bug");
    expect(form.getAll("image")).toHaveLength(1);
    spy.mockRestore();
  });

  test("the server sees only the documented parts: no operation history, no cookies", async () => {
    await submitFeedback(draft({ images: [PNG, PNG] }));
    const entry = portal.log.find((e) => e.method === "POST")!;
    expect(Object.keys(entry.fields).sort()).toEqual(["body", "category", "id", "title"]);
    expect(entry.files.map((f) => f.name)).toEqual(["image", "image"]);
    expect(entry.files.every((f) => f.type === "image/png")).toBe(true);
    expect(entry.cookie).toBeNull();
    expect(entry.authorization).toMatch(/^Bearer /);
    expect(portal.posts.get(ID)?.images).toHaveLength(2);
  });

  test("a text-only post sends no image parts", async () => {
    await submitFeedback(draft({ images: [] }));
    expect(portal.log.find((e) => e.method === "POST")!.files).toEqual([]);
  });

  test("the portal URL may have a trailing slash", async () => {
    await submitFeedback(draft({ portalUrl: `${portal.url}/` }));
    expect(portal.posts.size).toBe(1);
  });

  test("CORS: the stub answers the preflight and the post for the allowed origin only", async () => {
    const preflight = await fetch(`${portal.url}/api/posts`, {
      method: "OPTIONS",
      headers: { Origin: HOST },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(HOST);
    expect(preflight.headers.get("access-control-allow-headers")).toMatch(/authorization/i);
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
    const other = await fetch(`${portal.url}/api/posts`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("submitFeedback: retries and errors", () => {
  test("a 401 refreshes the token once and retries with the same post id", async () => {
    const result = await submitFeedback(draft({ title: "Needs refresh /fail401" }));
    expect(result.postId).toBe(ID);
    expect(tokensIssued).toBe(2);
    const posts = portal.log.filter((e) => e.method === "POST");
    expect(posts.map((p) => p.status)).toEqual([401, 201]);
    expect(posts.map((p) => p.fields.id)).toEqual([ID, ID]);
    expect(posts[0].authorization).not.toBe(posts[1].authorization);
  });

  test("a second 401 is reported, after exactly one refresh", async () => {
    await expect(submitFeedback(draft({ title: "Never works /fail401x2" }))).rejects.toMatchObject({
      kind: "api",
      code: "unauthenticated",
      status: 401,
    });
    expect(tokensIssued).toBe(2);
  });

  test("a retried draft is accepted: the same id replays instead of duplicating", async () => {
    await expect(submitFeedback(draft({ title: "Slow down /fail429" }))).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfterSeconds: 30,
    });
    expect(portal.posts.size).toBe(0);
    await submitFeedback(draft({ title: "Slow down /fail429" })); // the user presses "Try again": same draft, same id
    await submitFeedback(draft({ title: "Slow down /fail429" })); // a lost response followed by a retry
    expect(portal.posts.size).toBe(1);
    expect(portal.log.filter((e) => e.status === 200)).toHaveLength(1);
  });

  test("a network failure becomes a FeedbaxError and the caller keeps its inputs", async () => {
    const images = [PNG];
    const input = draft({ title: "Dropped /failnet", images });
    const error = await submitFeedback(input).catch((e) => e);
    expect(error).toBeInstanceOf(FeedbaxError);
    expect(error).toMatchObject({ kind: "network" });
    expect(input.images).toBe(images);
    expect(images[0].size).toBe(PNG.size);
    await submitFeedback(input); // a retry of the same draft works
    expect(portal.posts.has(ID)).toBe(true);
  });

  test("a server error carries the field and code", async () => {
    await expect(submitFeedback(draft({ title: "   " }))).rejects.toMatchObject({
      code: "invalid_input",
      field: "title",
    });
  });

  test("a rejected image maps to the image field", async () => {
    const bad = new Blob(["GIF89a......"], { type: "image/png" });
    await expect(submitFeedback(draft({ images: [bad] }))).rejects.toMatchObject({
      code: "unsupported_image",
      status: 415,
    });
  });

  test("a token failure is reported as such and nothing is posted", async () => {
    const failing = async () => {
      throw new FeedbaxError("token", "nope", { status: 401 });
    };
    await expect(submitFeedback(draft({ getToken: failing }))).rejects.toMatchObject({
      kind: "token",
      status: 401,
    });
    expect(portal.log.filter((e) => e.method === "POST")).toHaveLength(0);
  });

  test("aborting stops the request without wrapping it", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(submitFeedback(draft({ signal: controller.signal }))).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("describeSubmitError", () => {
  const api = (code: ConstructorParameters<typeof FeedbaxError>[2] extends infer E ? E : never) =>
    new FeedbaxError("api", "server words", code);

  test("explains each failure in plain language and says whether a retry can help", () => {
    expect(describeSubmitError(new FeedbaxError("token", "x", { status: 401 }))).toMatchObject({
      retryable: true,
      message: expect.stringMatching(/signed in/i),
    });
    expect(describeSubmitError(new FeedbaxError("network", "x"))).toMatchObject({
      retryable: true,
      message: expect.stringMatching(/connection/i),
    });
    expect(
      describeSubmitError(api({ code: "rate_limited", status: 429, retryAfterSeconds: 600 })),
    ).toMatchObject({ retryable: true, message: expect.stringContaining("10 minutes") });
    expect(describeSubmitError(api({ code: "rate_limited", status: 429 })).message).toContain(
      "a little while",
    );
    expect(describeSubmitError(api({ code: "too_large", status: 413 }))).toMatchObject({
      retryable: false,
      field: "image",
    });
    expect(describeSubmitError(api({ code: "unsupported_image", status: 415 }))).toMatchObject({
      retryable: false,
      field: "image",
    });
    expect(
      describeSubmitError(api({ code: "invalid_input", status: 400, field: "body" })),
    ).toMatchObject({ retryable: false, field: "body", message: "server words" });
    expect(describeSubmitError(api({ code: "conflict", status: 409 })).retryable).toBe(false);
    expect(describeSubmitError(api({ code: "unavailable", status: 503 })).retryable).toBe(true);
    expect(describeSubmitError(new Error("boom")).retryable).toBe(true);
  });
});

describe("token getter and sign-in URL", () => {
  test("createTokenGetter POSTs same-origin with no caching and returns the token", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ token: "t.t.t" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await createTokenGetter()()).toEqual({ token: "t.t.t" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedbax-token",
      expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }),
    );
    await createTokenGetter("/custom")();
    expect(fetchMock).toHaveBeenLastCalledWith("/custom", expect.anything());
  });

  test("createTokenGetter turns a 401, an outage and a bad body into FeedbaxErrors", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    await expect(createTokenGetter()()).rejects.toMatchObject({ kind: "token", status: 401 });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    await expect(createTokenGetter()()).rejects.toMatchObject({ kind: "token" });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    await expect(createTokenGetter()()).rejects.toMatchObject({ kind: "token" });
  });

  test("signInUrl builds the SSO link and only allows safe landing paths", () => {
    expect(signInUrl({ portalUrl: "https://p.example/", token: "a.b.c", to: `/posts/${ID}` })).toBe(
      `https://p.example/api/auth/feedbax/sign-in?token=a.b.c&to=%2Fposts%2F${ID}`,
    );
    expect(signInUrl({ portalUrl: "https://p.example", token: "a.b.c" })).toBe(
      "https://p.example/api/auth/feedbax/sign-in?token=a.b.c&to=%2F",
    );
    expect(
      signInUrl({ portalUrl: "https://p.example", token: "t", to: "https://evil.example" }),
    ).toContain("to=%2F");
    expect(signInUrl({ portalUrl: "https://p.example", token: "t", to: "//evil.example" })).toBe(
      "https://p.example/api/auth/feedbax/sign-in?token=t&to=%2F",
    );
  });

  test("a token minted by the helper signs a user in on the stub, once", async () => {
    const { token } = await getToken();
    const url = signInUrl({ portalUrl: portal.url, token, to: `/posts/${ID}` });
    const first = await fetch(url, { redirect: "manual" });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe(`/posts/${ID}`);
    expect(first.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await fetch(url, { redirect: "manual" })).status).toBe(401); // single use
  });

  test("normalizePortalUrl rejects non-http(s) URLs", () => {
    expect(() => normalizePortalUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizePortalUrl("not a url")).toThrow();
    expect(normalizePortalUrl("https://a.example/x/")).toBe("https://a.example/x");
  });
});
