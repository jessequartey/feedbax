import { bindingSecret } from "./binding-secret";
import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { createIntegrationService } from "./service";

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
it("rejects unpaired token requests and unsigned webhook ingress without upstream access", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  for (const file of (
    await readdir(new URL("../migrations/", import.meta.url))
  ).sort())
    await database.exec(
      (
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        )
      )
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  const service = createIntegrationService({
    database,
    origin: "https://service.example",
    app: {
      id: "123",
      clientId: "client",
      clientSecret: "client-secret",
      privateKey: "unused",
      webhookSecret: "hook-secret",
    },
    signingSecret: "s".repeat(40),
    trustedPortalOrigins: ["https://portal.account.workers.dev"],
    request: async () => {
      throw new Error("Unauthenticated request reached upstream.");
    },
  });
  const token = await service.fetch(
    new Request("https://service.example/v1/token", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(token.status).toBe(401);
  expect(token.headers.get("Cache-Control")).toBe("no-store");
  const webhook = await service.fetch(
    new Request("https://service.example/webhooks/github", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(webhook.status).toBe(401);
  expect(
    await (
      await service.fetch(new Request("https://service.example/health"))
    ).json(),
  ).toEqual({ status: "ok" });
});

it("pairs only after GitHub authorization and portal proof, scopes tokens, and rejects callback/token replay", async () => {
  const { createHmac, generateKeyPairSync } = await import("node:crypto");
  const { signIntegrationRequest } =
    await import("../../../packages/feedback/src/integration-auth");
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  for (const file of (
    await readdir(new URL("../migrations/", import.meta.url))
  ).sort())
    await database.exec(
      (
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        )
      )
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  const pairSecret = "p".repeat(40);
  let revocationDelivered = false;
  let credentials: { portalSecret: string; deliverySecret: string } | undefined;
  const service = createIntegrationService({
    database,
    origin: "https://service.example",
    app: {
      id: "123",
      clientId: "client",
      clientSecret: "client-secret",
      privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
        .privateKey.export({ format: "pem", type: "pkcs1" })
        .toString(),
      webhookSecret: "hook-secret",
    },
    signingSecret: "s".repeat(40),
    trustedPortalOrigins: ["https://portal.account.workers.dev"],
    request: async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const url = request.url;
      if (url === "https://github.com/login/oauth/access_token")
        return Response.json({ access_token: "user-access" });
      if (url.includes("/user/installations/99/repositories"))
        return Response.json({
          repositories: [
            { id: 123, name: "feedback", owner: { login: "acme" } },
          ],
          total_count: 1,
        });
      if (
        url === "https://api.github.com/repos/acme/feedback" &&
        request.headers.get("Authorization") === "Bearer user-access"
      )
        return Response.json({ id: 123, permissions: { push: true } });
      if (url === "https://api.github.com/app")
        return Response.json({ slug: "feedbax-test" });
      if (url.includes("/users/feedbax-test%5Bbot%5D")) {
        // Shared Worker egress can exhaust anonymous GitHub API limits.
        if (request.headers.get("Authorization") !== "Bearer user-access")
          return new Response(null, { status: 403 });
        return Response.json({ id: 456 });
      }
      if (
        url === "https://portal.account.workers.dev/internal/integration/pair"
      ) {
        const body = (await request.json()) as {
          challenge: string;
          credentials?: typeof credentials;
        };
        if (body.credentials) credentials = body.credentials;
        return Response.json({
          proof: createHmac("sha256", pairSecret)
            .update(
              JSON.stringify([
                "feedbax-pair-v1",
                "portal-acme",
                "https://portal.account.workers.dev",
                "https://service.example",
                body.challenge,
              ]),
            )
            .digest("hex"),
        });
      }
      if (
        url ===
        "https://portal.account.workers.dev/internal/integration/delivery"
      ) {
        revocationDelivered =
          ((await request.json()) as { kind: string }).kind === "revoke";
        return new Response(null, { status: 202 });
      }
      if (url === "https://api.github.com/app/installations/99/access_tokens") {
        expect(await request.json()).toEqual({
          repository_ids: [123],
          permissions: { issues: "write", metadata: "read" },
        });
        return Response.json({
          token: "repository-scoped-token",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      }
      if (url === "https://api.github.com/repos/acme/feedback")
        return Response.json({ id: 123 });
      throw new Error(`Unexpected upstream URL: ${url}`);
    },
  });
  const begin = await service.fetch(
    new Request("https://service.example/v1/pair", {
      method: "POST",
      body: JSON.stringify({
        installationId: "portal-acme",
        origin: "https://portal.account.workers.dev",
        githubInstallationId: 99,
        repositoryId: 123,
        pairingSecret: pairSecret,
      }),
    }),
  );
  expect(begin.status).toBe(200);
  const { authorizeUrl } = (await begin.json()) as { authorizeUrl: string };
  const state = new URL(authorizeUrl).searchParams.get("state");
  const callback = () =>
    service.fetch(
      new Request(
        `https://service.example/callback?state=${state}&code=user-code`,
      ),
    );
  const completed = await callback();
  expect(completed.status).toBe(200);
  expect(await completed.text()).not.toContain("Secret");
  expect((await callback()).status).toBe(400);
  expect(credentials?.portalSecret).toHaveLength(43);
  expect(credentials?.deliverySecret).not.toBe(credentials?.portalSecret);
  const signed = signIntegrationRequest({
    url: "https://service.example/v1/token",
    installationId: "portal-acme",
    secret: credentials!.portalSecret,
    body: "{}",
  });
  const replay = signed.clone();
  const issued = await service.fetch(signed);
  expect(issued.status).toBe(200);
  expect(await issued.json()).toMatchObject({
    repositoryId: 123,
    botUserId: 456,
    token: "repository-scoped-token",
  });
  expect((await service.fetch(replay)).status).toBe(401);
  expect(
    (
      await service.fetch(
        signIntegrationRequest({
          url: "https://service.example/v1/token",
          installationId: "another-portal",
          secret: credentials!.portalSecret,
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await service.fetch(
        signIntegrationRequest({
          url: "https://service.example/v1/revoke",
          installationId: "portal-acme",
          secret: credentials!.portalSecret,
          body: "{}",
        }),
      )
    ).status,
  ).toBe(200);
  expect(await service.process()).toMatchObject({ completed: 1 });
  expect(revocationDelivered).toBe(true);
});

it("deduplicates signed webhooks durably, revokes removed resources, and survives delivery failure without exposing payloads", async () => {
  const { createHmac } = await import("node:crypto");
  const { signIntegrationRequest } =
    await import("../../../packages/feedback/src/integration-auth");
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  for (const file of (
    await readdir(new URL("../migrations/", import.meta.url))
  ).sort())
    await database.exec(
      (
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        )
      )
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  // A previously paired binding is durable external setup data.
  await database
    .prepare(
      "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .bind(
      "portal-acme",
      "https://portal.account.workers.dev",
      99,
      123,
      "acme",
      "feedback",
      456,
      Date.now(),
    )
    .run();
  let available = false;
  const deliveries: string[] = [];
  const master = "s".repeat(40);
  const service = createIntegrationService({
    database,
    origin: "https://service.example",
    app: {
      id: "123",
      clientId: "client",
      clientSecret: "client-secret",
      privateKey: "unused",
      webhookSecret: "hook-secret",
    },
    signingSecret: master,
    trustedPortalOrigins: ["https://portal.account.workers.dev"],
    request: async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe(
        "https://portal.account.workers.dev/internal/integration/delivery",
      );
      const body = await request.text();
      expect(body).not.toContain("private engineering");
      deliveries.push(body);
      return new Response(null, { status: available ? 200 : 503 });
    },
  });
  const payload = JSON.stringify({
    installation: { id: 99 },
    repository: { id: 123 },
    action: "edited",
    issue: { body: "private engineering" },
  });
  const webhook = (body: string, id: string) =>
    new Request("https://service.example/webhooks/github", {
      method: "POST",
      headers: {
        "X-GitHub-Event": "issues",
        "X-GitHub-Delivery": id,
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", "hook-secret").update(body).digest("hex")}`,
      },
      body,
    });
  expect((await service.fetch(webhook(payload, "delivery-one"))).status).toBe(
    202,
  );
  expect((await service.fetch(webhook(payload, "delivery-one"))).status).toBe(
    202,
  );
  expect(await service.process()).toMatchObject({ completed: 0, failed: 1 });
  expect(deliveries).toHaveLength(1);
  available = true;
  const removed = JSON.stringify({
    action: "deleted",
    installation: { id: 99 },
  });
  const revoke = webhook(removed, "delivery-two");
  revoke.headers.set("X-GitHub-Event", "installation");
  expect((await service.fetch(revoke)).status).toBe(202);
  const access = signIntegrationRequest({
    url: "https://service.example/v1/token",
    installationId: "portal-acme",
    secret: bindingSecret(
      master,
      {
        installation_id: "portal-acme",
        origin: "https://portal.account.workers.dev",
        github_installation_id: 99,
        repository_id: 123,
        key_version: 1,
      },
      "portal",
    ),
    body: "{}",
  });
  expect((await service.fetch(access)).status).toBe(401);
  expect(await service.process()).toMatchObject({ completed: 1 });
  expect(deliveries.at(-1)).toContain('"kind":"revoke"');
  const health = await (
    await service.fetch(new Request("https://service.example/health"))
  ).text();
  expect(health).not.toContain("delivery");
  expect(health).not.toContain("private");
});
