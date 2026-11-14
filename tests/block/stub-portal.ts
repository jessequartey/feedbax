// A stand-in for the Feedbax portal's host endpoints, used by the block's tests and by the local demo.
// It verifies the HS256 host token with node:crypto (an implementation independent of the block's signer),
// accepts the multipart create-post request, enforces CORS for one origin, and serves a tiny post page.
// Erasable TypeScript only: it runs under Node 24 type stripping and inside Vite's config loader.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

export type StubPost = {
  id: string;
  authorSub: string;
  authorName: string;
  title: string;
  body: string;
  category: string;
  images: Array<{ mime: string; bytes: Buffer }>;
  createdAt: number;
};
export type StubRequestLog = {
  method: string;
  path: string;
  origin: string | null;
  authorization: string | null;
  cookie: string | null;
  contentType: string | null;
  fields: Record<string, string>;
  files: Array<{ name: string; filename: string; type: string; size: number }>;
  status: number;
};
export type StubPortal = {
  url: string;
  port: number;
  posts: Map<string, StubPost>;
  log: StubRequestLog[];
  /** Forget posts, consumed tokens, failure counters and the request log. */
  reset: () => void;
  close: () => Promise<void>;
};

const HEADER = '{"alg":"HS256","typ":"JWT"}';
const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** Returns the claims when the token is valid, otherwise null. Does not consume the token. */
export function verifyHostToken(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): { sub: string; name: string; exp: number; jti: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 4096) return null;
  if (parts[0] !== b64url(HEADER)) return null;
  const expected = createHmac("sha256", Buffer.from(secret, "base64url"))
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const ok =
      typeof claims.sub === "string" &&
      claims.sub.length >= 1 &&
      claims.sub.length <= 200 &&
      !/[\r\n]/.test(claims.sub) &&
      typeof claims.name === "string" &&
      claims.name.length >= 1 &&
      claims.name.length <= 80 &&
      Number.isInteger(claims.exp) &&
      claims.exp > now - 30 &&
      claims.exp <= now + 330 &&
      typeof claims.jti === "string" &&
      /^[0-9a-f-]{36}$/i.test(claims.jti);
    return ok ? claims : null;
  } catch {
    return null;
  }
}

function sniff(bytes: Buffer): string | null {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  return null;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const PAGE_CSS = `body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#fafafa;color:#111}main{max-width:44rem;margin:0 auto;padding:2rem 1.25rem}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}a{color:inherit}.badge{display:inline-block;border:1px solid #ccc;padding:.1rem .5rem;font-size:12px}
.card{border:1px solid #ddd;background:#fff;padding:1rem 1.25rem;margin-bottom:1rem}img{max-width:100%;border:1px solid #ddd;margin-top:.75rem;display:block}pre{white-space:pre-wrap;font:inherit}`;

export async function startStubPortal(options: {
  /** The one origin allowed to call the API cross-origin, e.g. "http://localhost:5300". */
  hostOrigin: string;
  /** base64url FEEDBAX_HOST_SECRET. */
  secret: string;
  port?: number;
}): Promise<StubPortal> {
  const { hostOrigin, secret } = options;
  const posts = new Map<string, StubPost>();
  const log: StubRequestLog[] = [];
  const usedJti = new Set<string>();
  const attempts = new Map<string, number>();

  const cors = (req: IncomingMessage, headers: Record<string, string>) => {
    if (req.headers.origin === hostOrigin) {
      headers["Access-Control-Allow-Origin"] = hostOrigin;
      headers["Vary"] = "Origin";
      headers["Access-Control-Expose-Headers"] = "Retry-After";
    }
    return headers;
  };
  const json = (
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    body: unknown,
    extra: Record<string, string> = {},
  ) => {
    res.writeHead(
      status,
      cors(req, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }),
    );
    res.end(JSON.stringify(body));
    return status;
  };
  const apiError = (
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    code: string,
    message: string,
    field?: string,
    extra?: Record<string, string>,
  ) => json(req, res, status, { error: { code, message, ...(field ? { field } : {}) } }, extra);
  const html = (
    res: ServerResponse,
    status: number,
    body: string,
    extra: Record<string, string> = {},
  ) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...extra });
    res.end(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PAGE_CSS}</style>${body}`,
    );
    return status;
  };

  async function createPost(
    req: IncomingMessage,
    res: ServerResponse,
    entry: StubRequestLog,
  ): Promise<number> {
    const auth = req.headers.authorization ?? "";
    const claims = auth.startsWith("Bearer ") ? verifyHostToken(auth.slice(7), secret) : null;
    if (!claims || usedJti.has(claims.jti))
      return apiError(
        req,
        res,
        401,
        "unauthenticated",
        "That token was not accepted. Fetch a fresh one.",
      );
    const request = new Request("http://stub.local/api/posts", {
      method: "POST",
      headers: { "content-type": String(req.headers["content-type"] ?? "") },
      body: Readable.toWeb(req) as ReadableStream,
      duplex: "half",
    } as RequestInit);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError(
        req,
        res,
        400,
        "invalid_input",
        "The request was not valid multipart form data.",
      );
    }
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") entry.fields[key] = value;
      else
        entry.files.push({ name: key, filename: value.name, type: value.type, size: value.size });
    }
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : "";
    };
    const id = text("id");
    const title = text("title").trim();
    const body = text("body").trim();
    const category = text("category");

    // Failure injection for the demo and tests: the first attempt for this post id fails, a retry succeeds.
    const attempt = (attempts.get(id) ?? 0) + 1;
    attempts.set(id, attempt);
    if (attempt === 1) {
      if (title.includes("/fail429"))
        return apiError(req, res, 429, "rate_limited", "Too many posts.", undefined, {
          "Retry-After": "30",
        });
      if (title.includes("/fail500"))
        return apiError(req, res, 503, "unavailable", "Try again soon.");
      if (title.includes("/failnet")) {
        req.socket.destroy();
        return 0;
      }
    }
    // "/fail401" fails once (the client's single token refresh recovers); "/fail401x2" fails twice (an error is shown).
    if (title.includes("/fail401x2") ? attempt <= 2 : title.includes("/fail401") && attempt <= 1)
      return apiError(req, res, 401, "unauthenticated", "Token rejected.");

    usedJti.add(claims.jti);
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return apiError(req, res, 400, "invalid_input", "id must be a UUID.", "id");
    if (!title || title.length > 120)
      return apiError(req, res, 400, "invalid_input", "Title must be 1-120 characters.", "title");
    if (!body || body.length > 5000)
      return apiError(
        req,
        res,
        400,
        "invalid_input",
        "Description must be 1-5000 characters.",
        "body",
      );
    if (!["feature", "bug", "general"].includes(category))
      return apiError(req, res, 400, "invalid_input", "Unknown category.", "category");
    const files = form.getAll("image").filter((v): v is File => typeof v !== "string");
    if (files.length > 3)
      return apiError(req, res, 400, "invalid_input", "At most 3 images.", "image");
    const images: StubPost["images"] = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024)
        return apiError(req, res, 413, "too_large", "Image over 5 MiB.", "image");
      const mime = sniff(bytes);
      if (!mime || mime !== file.type)
        return apiError(
          req,
          res,
          415,
          "unsupported_image",
          "Images must be PNG, JPEG or WebP.",
          "image",
        );
      images.push({ mime, bytes });
    }
    const existing = posts.get(id);
    if (existing) {
      if (existing.authorSub !== claims.sub)
        return apiError(req, res, 409, "conflict", "That id belongs to someone else.");
      return json(req, res, 200, { postId: id, postUrl: `${urlOf()}/posts/${id}` });
    }
    posts.set(id, {
      id,
      authorSub: claims.sub,
      authorName: claims.name,
      title,
      body,
      category,
      images,
      createdAt: Date.now(),
    });
    return json(req, res, 201, { postId: id, postUrl: `${urlOf()}/posts/${id}` });
  }

  function signIn(req: IncomingMessage, res: ServerResponse, url: URL): number {
    const claims = verifyHostToken(url.searchParams.get("token") ?? "", secret);
    const to = url.searchParams.get("to") ?? "/";
    const safeTo = /^(\/|\/posts\/[0-9a-f-]{36})$/i.test(to) ? to : "/";
    const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
    if (!claims || usedJti.has(claims.jti))
      return html(
        res,
        401,
        `<main><div class="card"><h1>This link expired</h1><p>Go back to <a href="${escapeHtml(hostOrigin)}">your app</a> and try again.</p></div></main>`,
        headers,
      );
    usedJti.add(claims.jti);
    res.writeHead(302, {
      ...headers,
      Location: safeTo,
      "Set-Cookie": `stub_session=${encodeURIComponent(claims.name)}; Path=/; HttpOnly; SameSite=Lax`,
    });
    res.end();
    return 302;
  }

  function page(req: IncomingMessage, res: ServerResponse, url: URL): number {
    const who = /stub_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    const header = `<header><strong>Feedbax portal (stub)</strong><span>${who ? `Signed in as ${escapeHtml(decodeURIComponent(who))} · ` : ""}<a href="${escapeHtml(hostOrigin)}">Back to app</a></span></header>`;
    const match = /^\/posts\/([0-9a-f-]{36})$/i.exec(url.pathname);
    if (match) {
      const post = posts.get(match[1].toLowerCase()) ?? posts.get(match[1]);
      if (!post)
        return html(res, 404, `<main>${header}<div class="card">Post not found.</div></main>`);
      const images = post.images
        .map((_, i) => `<img alt="Attached image ${i + 1}" src="/api/media/${post.id}/${i}">`)
        .join("");
      return html(
        res,
        200,
        `<main>${header}<article class="card"><span class="badge">${escapeHtml(post.category)}</span><h1>${escapeHtml(post.title)}</h1><p>by ${escapeHtml(post.authorName)}</p><pre>${escapeHtml(post.body)}</pre>${images}</article></main>`,
      );
    }
    const items = [...posts.values()]
      .reverse()
      .map(
        (p) =>
          `<div class="card"><a href="/posts/${p.id}">${escapeHtml(p.title)}</a> <span class="badge">${escapeHtml(p.category)}</span></div>`,
      )
      .join("");
    return html(res, 200, `<main>${header}<h1>Posts</h1>${items || "<p>No posts yet.</p>"}</main>`);
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub.local");
    const entry: StubRequestLog = {
      method: req.method ?? "GET",
      path: url.pathname,
      origin: (req.headers.origin as string) ?? null,
      authorization: req.headers.authorization ?? null,
      cookie: req.headers.cookie ?? null,
      contentType: (req.headers["content-type"] as string) ?? null,
      fields: {},
      files: [],
      status: 0,
    };
    log.push(entry);
    try {
      if (url.pathname === "/api/posts" && req.method === "OPTIONS") {
        const headers = cors(req, {});
        if (headers["Access-Control-Allow-Origin"]) {
          headers["Access-Control-Allow-Methods"] = "POST";
          headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
          headers["Access-Control-Max-Age"] = "600";
        }
        res.writeHead(204, headers);
        res.end();
        entry.status = 204;
      } else if (url.pathname === "/api/posts" && req.method === "POST") {
        entry.status = await createPost(req, res, entry);
      } else if (url.pathname === "/api/auth/feedbax/sign-in" && req.method === "GET") {
        entry.status = signIn(req, res, url);
      } else if (req.method === "GET" && url.pathname.startsWith("/api/media/")) {
        const [, , , id, index] = url.pathname.split("/");
        const image = posts.get(id)?.images[Number(index)];
        if (!image) {
          res.writeHead(404).end();
          entry.status = 404;
        } else {
          res
            .writeHead(200, { "Content-Type": image.mime, "X-Content-Type-Options": "nosniff" })
            .end(image.bytes);
          entry.status = 200;
        }
      } else if (req.method === "GET") {
        entry.status = page(req, res, url);
      } else {
        res.writeHead(404).end();
        entry.status = 404;
      }
    } catch (error) {
      if (!res.headersSent) res.writeHead(500).end(String(error));
      entry.status = 500;
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const urlOf = () => `http://localhost:${port}`;
  return {
    url: urlOf(),
    port,
    posts,
    log,
    reset: () => {
      posts.clear();
      usedJti.clear();
      attempts.clear();
      log.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
