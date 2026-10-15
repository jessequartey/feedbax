import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { search } from "./lib/search";
import { createDocsIdentityApplication } from "./docs-identity";

let identity: ReturnType<typeof createDocsIdentityApplication> | undefined;

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (
      url.pathname === "/feedbax-login" ||
      url.pathname.startsWith("/api/auth/") ||
      url.pathname.startsWith("/api/docs/")
    ) {
      try {
        if (
          !identity &&
          env.DOCS_AUTH_DB &&
          env.DOCS_SITE_URL &&
          env.FEEDBAX_PORTAL_ORIGIN &&
          env.DOCS_AUTH_SECRET &&
          env.IDENTITY_HANDOFF_SECRET &&
          env.RESEND_API_KEY &&
          env.AUTH_EMAIL_FROM
        ) {
          identity = createDocsIdentityApplication({
            database: env.DOCS_AUTH_DB,
            origin: env.DOCS_SITE_URL,
            portalOrigin: env.FEEDBAX_PORTAL_ORIGIN,
            authSecret: env.DOCS_AUTH_SECRET,
            handoffSecret: env.IDENTITY_HANDOFF_SECRET,
            emailFrom: env.AUTH_EMAIL_FROM,
            resendToken: env.RESEND_API_KEY,
          });
        }
        if (identity) return await identity(request);
      } catch {
        console.error("Docs sign-in request failed.");
      }
      return Response.json(
        { error: "Sign-in is unavailable. Please try again later." },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
    if (url.pathname === "/api/search") return search.GET(request);
    if (url.hostname === "www.feedbax.dev") {
      url.hostname = "feedbax.dev";
      return Response.redirect(url, 301);
    }
    const response = await handler.fetch(request);
    if (url.pathname === "/sign-in") {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Referrer-Policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
