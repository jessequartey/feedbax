// Local demo of the Feedbax block: a fake "host app" on one port and a stub Feedbax portal on another,
// so the dialog really does cross-origin requests with `credentials: 'omit'`.
//
//   npx vp dev tests/block/demo --port 5300
//
// Then open http://localhost:5300. The portal stub listens on 5301 (override with FEEDBAX_DEMO_PORTAL_PORT).
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { mintFeedbaxToken } from "../../../registry/feedbax-feedback/lib/token.server.ts";
import { startStubPortal, type StubPortal } from "../stub-portal.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const secret: string = JSON.parse(
  readFileSync(`${repo}tests/fixtures/host-tokens.json`, "utf8"),
).secret;
const portalPort = Number(process.env.FEEDBAX_DEMO_PORTAL_PORT ?? 5301);

const COOKIE = "demo_user";
const user = { id: "demo-ada", name: "Ada Lovelace" };

function demoApi(hostOrigin: () => string) {
  const send = (
    res: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
  const signedIn = (req: IncomingMessage) => (req.headers.cookie ?? "").includes(`${COOKIE}=ada`);
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/api/demo-session")
      return send(res, 200, { signedIn: signedIn(req), user: signedIn(req) ? user : null });
    if (path === "/api/demo-login")
      return send(
        res,
        200,
        { ok: true },
        { "Set-Cookie": `${COOKIE}=ada; Path=/; HttpOnly; SameSite=Lax` },
      );
    if (path === "/api/demo-logout")
      return send(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0` });
    if (path === "/api/feedbax-token") {
      // What a real host route does: POST only, same-origin only, identity from the host's own session.
      if (req.method !== "POST") return send(res, 405, { error: "method" });
      const origin = req.headers.origin;
      if ((origin && origin !== hostOrigin()) || req.headers["sec-fetch-site"] === "cross-site")
        return send(res, 403, { error: "cross-origin" });
      if (!signedIn(req)) return send(res, 401, { error: "unauthenticated" });
      return void mintFeedbaxToken({ secret, user }).then((token) => send(res, 200, { token }));
    }
    next();
  };
}

export default defineConfig(({ command }) => {
  let portal: StubPortal | undefined;
  let hostOrigin = "http://localhost:5300";
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    cacheDir: `${repo}node_modules/.vite-block-demo`,
    define: { __PORTAL_URL__: JSON.stringify(`http://localhost:${portalPort}`) },
    resolve: {
      alias: [
        { find: /^@\/components\/ui\/(.*)$/, replacement: `${repo}src/components/ui/$1` },
        {
          find: /^@\/components\/feedbax\/(.*)$/,
          replacement: `${repo}registry/feedbax-feedback/components/$1`,
        },
        { find: /^@\/lib\/feedbax\/(.*)$/, replacement: `${repo}registry/feedbax-feedback/lib/$1` },
        { find: /^@\/(.*)$/, replacement: `${repo}src/$1` },
      ],
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "feedbax-demo",
        async configureServer(server) {
          server.httpServer?.once("listening", () => {
            const address = server.httpServer?.address();
            if (address && typeof address === "object")
              hostOrigin = `http://localhost:${address.port}`;
          });
          const portalHost =
            process.env.FEEDBAX_DEMO_HOST_ORIGIN ??
            server.config.server.origin ??
            `http://localhost:${server.config.server.port ?? 5300}`;
          hostOrigin = portalHost;
          if (command === "serve") {
            portal = await startStubPortal({ hostOrigin: portalHost, secret, port: portalPort });
            server.config.logger.info(
              `  Feedbax portal stub: ${portal.url} (allows ${portalHost})`,
            );
          }
          server.middlewares.use(demoApi(() => hostOrigin));
          server.httpServer?.once("close", () => void portal?.close());
        },
      },
    ],
    server: { fs: { allow: [repo] } },
  };
});
