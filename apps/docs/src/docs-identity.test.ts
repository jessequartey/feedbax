import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { verifyIdentityHandoff } from "../../../packages/feedback/src/index";
import { createDocsIdentityApplication } from "./docs-identity";

it("authenticates email ownership before handing the docs identity to Feedbax", async () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
  });
  try {
    const database = await runtime.getD1Database("DB");
    await database.exec(
      await readFile("apps/docs/migrations/0001_auth.sql", "utf8"),
    );
    const messages: { text: string; to: string[] }[] = [];
    const secret = "test-docs-identity-handoff-secret-32-characters";
    const handle = createDocsIdentityApplication({
      database,
      origin: "https://docs.example",
      portalOrigin: "https://feedback.example",
      authSecret: "test-docs-auth-secret-at-least-32-characters",
      handoffSecret: secret,
      emailFrom: "signin@example.com",
      resendToken: "test-resend-token",
      request: async (_url, init) => {
        messages.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "delivery-id" });
      },
    });
    const state = "a".repeat(43);
    const loginUrl = `https://docs.example/feedbax-login?${new URLSearchParams({ state, callback: "https://feedback.example/internal/identity/callback" })}`;
    const unauthenticated = await handle(new Request(loginUrl));
    expect(unauthenticated.status).toBe(303);
    expect(unauthenticated.headers.get("location")).toContain(
      "/sign-in?returnTo=",
    );
    const requested = await handle(
      new Request("https://docs.example/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          Origin: "https://docs.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "ama@example.com",
          name: "Ama",
          callbackURL: "/docs",
        }),
      }),
    );
    expect(requested.status).toBe(200);
    expect(messages[0]?.to).toEqual(["ama@example.com"]);
    const link = messages[0]?.text.match(/https:\/\/[^\s]+/)?.[0];
    expect(link).toBeTruthy();
    const emailLink = new URL(link!);
    expect(emailLink.pathname).toBe("/sign-in");
    expect(emailLink.search).toBe("");
    const claim = new URLSearchParams(emailLink.hash.slice(1));
    const verify = (origin = "https://docs.example") =>
      handle(
        new Request("https://docs.example/api/docs/verify", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({
            token: claim.get("token"),
            returnTo: claim.get("returnTo"),
          }),
        }),
      );
    expect((await verify("https://evil.example")).status).toBe(403);
    const verified = await verify();
    expect(verified.status).toBe(200);
    expect((await verified.clone().json()).redirectTo).toBe("/docs");
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookie).toContain("__Secure-feedbax-docs.session_token=");
    const signed = await handle(
      new Request(loginUrl, { headers: { Cookie: cookie } }),
    );
    expect(signed.status).toBe(200);
    expect(signed.headers.get("cache-control")).toBe("no-store");
    expect(signed.headers.get("referrer-policy")).toBe("strict-origin");
    const html = await signed.text();
    const token = /name="token" value="([^"]+)"/.exec(html)?.[1];
    const identity = verifyIdentityHandoff(token!, secret, {
      audience: "https://feedback.example",
      issuer: "https://docs.example",
      state,
      now: Math.floor(Date.now() / 1000),
    });
    expect(identity).toMatchObject({
      displayName: "Ama",
      email: "ama@example.com",
    });
    expect(identity.subject).toBeTruthy();
    expect(html).not.toContain(secret);
    const privateSession = await handle(
      new Request("https://docs.example/api/docs/session", {
        headers: { Cookie: cookie },
      }),
    );
    expect(await privateSession.json()).toEqual({ user: { name: "Ama" } });
    expect(
      (
        await handle(
          new Request("https://docs.example/api/auth/get-session", {
            headers: { Cookie: cookie },
          }),
        )
      ).status,
    ).toBe(404);
    const replayed = await verify();
    expect(replayed.status).toBe(401);
    expect(replayed.headers.getSetCookie()).toEqual([]);
    await handle(
      new Request("https://docs.example/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          Origin: "https://docs.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "ama@example.com",
          name: "Different name",
          callbackURL: "/docs",
        }),
      }),
    );
    const again = new URLSearchParams(
      new URL(messages[1]!.text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1),
    );
    const claimAgain = () =>
      handle(
        new Request("https://docs.example/api/docs/verify", {
          method: "POST",
          headers: {
            Origin: "https://docs.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: again.get("token"),
            returnTo: "/docs",
          }),
        }),
      );
    const concurrent = await Promise.all([claimAgain(), claimAgain()]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    const secondCookie = concurrent
      .find((response) => response.status === 200)!
      .headers.getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const secondHandoff = await handle(
      new Request(loginUrl, { headers: { Cookie: secondCookie } }),
    );
    const secondToken = /name="token" value="([^"]+)"/.exec(
      await secondHandoff.text(),
    )?.[1];
    const secondIdentity = verifyIdentityHandoff(secondToken!, secret, {
      audience: "https://feedback.example",
      issuer: "https://docs.example",
      state,
      now: Math.floor(Date.now() / 1000),
    });
    expect(secondIdentity.subject).toBe(identity.subject);
    expect(secondIdentity.displayName).toBe("Ama");
    const loggedOut = await handle(
      new Request("https://docs.example/api/auth/sign-out", {
        method: "POST",
        headers: {
          Origin: "https://docs.example",
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(loggedOut.status).toBe(200);
    expect(
      (await handle(new Request(loginUrl, { headers: { Cookie: cookie } })))
        .status,
    ).toBe(303);
    expect(
      (
        await handle(
          new Request(loginUrl, { headers: { Cookie: secondCookie } }),
        )
      ).status,
    ).toBe(200);
  } finally {
    await runtime.dispose();
  }
});
