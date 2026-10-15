import { expect, it } from "vitest";
import { createConnectedIdentityHandler } from "./connected-identity";

it("starts sign-in with a secure browser challenge and never accepts a return URL", async () => {
  const handler = createConnectedIdentityHandler({
    siteUrl: "https://feedback.example",
    loginUrl: "https://app.example/feedback-login",
    issuer: "https://app.example",
    secret: "identity-test-secret-at-least-32-characters",
    store: undefined!,
  });
  const response = await handler(
    new Request(
      "https://feedback.example/internal/identity/start?returnTo=https://evil.example",
    ),
  );
  expect(response.status).toBe(303);
  const target = new URL(response.headers.get("location")!);
  expect(target.origin).toBe("https://app.example");
  expect(target.searchParams.get("state")?.length).toBeGreaterThan(30);
  expect(target.searchParams.get("callback")).toBe(
    "https://feedback.example/internal/identity/callback",
  );
  expect(response.headers.get("set-cookie")).toContain(
    "HttpOnly; Secure; SameSite=None",
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("exchanges a browser-bound handoff once, keeps identity private, and revokes sessions on logout", async () => {
  const { Miniflare } = await import("miniflare");
  const { readFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { createConnectedStore, signIdentityHandoff } =
    await import("@feedbax/feedback");
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
  });
  try {
    const db = await runtime.getD1Database("DB");
    await db.exec(
      (await readFile(
        existsSync("apps/portal/migrations/0001_connected.sql")
          ? "apps/portal/migrations/0001_connected.sql"
          : "migrations/0001_connected.sql",
        "utf8",
      )) +
        "\n" +
        (await readFile(
          existsSync("apps/portal/migrations/0002_participation.sql")
            ? "apps/portal/migrations/0002_participation.sql"
            : "migrations/0002_participation.sql",
          "utf8",
        )),
    );
    const secret = "identity-test-secret-at-least-32-characters";
    const handler = createConnectedIdentityHandler({
      siteUrl: "https://feedback.example",
      loginUrl: "https://app.example/login",
      issuer: "https://app.example",
      secret,
      store: createConnectedStore(db),
      now: () => 1000000,
    });
    const started = await handler(
      new Request("https://feedback.example/internal/identity/start"),
    );
    const challenge = started.headers.get("set-cookie")!.split(";")[0]!;
    const state = new URL(started.headers.get("location")!).searchParams.get(
      "state",
    )!;
    const token = signIdentityHandoff(
      {
        subject: "private-subject",
        displayName: "Alice",
        audience: "https://feedback.example",
        issuer: "https://app.example",
        state,
        nonce: "nonce",
        issuedAt: 1000,
        expiresAt: 1100,
      },
      secret,
    );
    const callback = (cookie: string, origin = "https://app.example") =>
      new Request("https://feedback.example/internal/identity/callback", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
      });
    expect((await handler(callback(""))).status).toBe(401);
    expect(
      (await handler(callback(challenge, "https://evil.example"))).status,
    ).toBe(403);
    const signedIn = await handler(callback(challenge));
    expect(signedIn.status).toBe(303);
    expect((await handler(callback(challenge))).status).toBe(401);
    const session = signedIn.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Host-feedbax-session="))!
      .split(";")[0]!;
    const sessionRequest = () =>
      new Request("https://feedback.example/internal/identity/session", {
        headers: { Cookie: session },
      });
    const response = await handler(sessionRequest());
    expect(response.headers.get("cache-control")).toBe("no-store");
    const identity = (await response.json()) as {
      participant: { displayName: string; sessionKey: string };
    };
    expect(identity.participant.displayName).toBe("Alice");
    expect(identity.participant.sessionKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(identity)).not.toContain("private-subject");
    expect(JSON.stringify(identity)).not.toContain(session.split("=")[1]);
    expect(
      (
        await handler(
          new Request("https://feedback.example/internal/identity/logout", {
            method: "POST",
            headers: { Cookie: session, Origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          new Request("https://feedback.example/internal/identity/logout", {
            method: "POST",
            headers: { Cookie: session, Origin: "https://feedback.example" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(await (await handler(sessionRequest())).json()).toEqual({
      participant: null,
    });
  } finally {
    await runtime.dispose();
  }
});
