import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { FeedbaxConfig } from "@feedbax/config";
import {
  createGitHubFeedbackModule,
  createGitHubServiceAccess,
  signIntegrationRequest,
} from "@feedbax/feedback";
import { createPortalIntegration } from "./integration-runtime";

const configuration: FeedbaxConfig = {
  provider: "github",
  product: {
    name: "Acme",
    description: "Feedback",
    logo: "/logo.svg",
    siteUrl: "https://portal.account.workers.dev",
  },
  theme: { preset: "lyra-neutral" },
  github: {
    installationId: "portal-acme",
    serviceUrl: "https://service.example",
    repository: { id: 123, owner: "acme", name: "feedback" },
    botUserId: 456,
  },
  features: { voting: true, comments: true, changelog: false },
  submissions: {
    moderation: "required",
    maxTitleLength: 160,
    maxDescriptionLength: 5000,
  },
  turnstile: { enabled: false },
};

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
it("accepts one authenticated pairing/delivery, rejects replays and Participant requests, and revokes provider access", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  const directory = resolve(import.meta.dirname, "../migrations");
  for (const file of (await readdir(directory)).sort())
    await database.exec(
      (await readFile(resolve(directory, file), "utf8"))
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  const config = configuration;
  const service = createPortalIntegration({
    config,
    database,
    pairingSecret: "p".repeat(40),
  });
  const pair = signIntegrationRequest({
    url: "https://portal.account.workers.dev/internal/integration/pair",
    installationId: "portal-acme",
    secret: "p".repeat(40),
    body: JSON.stringify({
      challenge: "c".repeat(43),
      repositoryId: 123,
      botUserId: 456,
      credentials: {
        portalSecret: "a".repeat(43),
        deliverySecret: "b".repeat(43),
      },
    }),
  });
  const replayPair = pair.clone();
  expect((await service.handle(pair))?.status).toBe(200);
  expect((await service.handle(replayPair))?.status).toBe(401);
  const url =
    "https://portal.account.workers.dev/internal/integration/delivery";
  expect(
    (
      await service.handle(
        new Request(url, {
          method: "POST",
          headers: { Cookie: "participant=anything" },
          body: JSON.stringify({ kind: "revoke" }),
        }),
      )
    )?.status,
  ).toBe(401);
  const signed = signIntegrationRequest({
    url,
    installationId: "portal-acme",
    secret: "b".repeat(43),
    body: JSON.stringify({ eventId: "event-one", kind: "reconcile" }),
  });
  const replay = signed.clone();
  expect((await service.handle(signed))?.status).toBe(202);
  expect((await service.handle(replay))?.status).toBe(401);
  expect(await service.portalSecret()).toBe("a".repeat(43));
  if (config.provider !== "github") throw Error("GitHub fixture required");
  const access = createGitHubServiceAccess({
    config: config.github,
    getSecret: service.portalSecret,
    request: async () =>
      Response.json({
        token: "scoped-token",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        repositoryId: 123,
        botUserId: 456,
      }),
  });
  expect(await access()).toBe("scoped-token");
  expect(
    (
      await service.handle(
        signIntegrationRequest({
          url,
          installationId: "portal-acme",
          secret: "b".repeat(43),
          body: JSON.stringify({ eventId: "event-two", kind: "revoke" }),
        }),
      )
    )?.status,
  ).toBe(202);
  await expect(service.portalSecret()).rejects.toThrow("revoked");
  await expect(access()).rejects.toThrow("revoked");
  expect(
    (
      await service.handle(
        signIntegrationRequest({
          url,
          installationId: "portal-acme",
          secret: "b".repeat(43),
          body: JSON.stringify({
            eventId: "after-revocation",
            kind: "reconcile",
          }),
        }),
      )
    )?.status,
  ).toBe(401);
});

it("backs off provider failures and fences concurrent portal reconciliation", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  const directory = resolve(import.meta.dirname, "../migrations");
  for (const file of (await readdir(directory)).sort())
    await database.exec(
      (await readFile(resolve(directory, file), "utf8"))
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  const github =
    configuration.provider === "github" ? configuration.github : undefined;
  if (!github) throw new Error("GitHub fixture required");
  let time = Date.now();
  let unavailable = false;
  let reads = 0;
  let release: (() => void) | undefined;
  let observed: (() => void) | undefined;
  let hold = false;
  const started = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const issue = {
    id: 1000,
    number: 1,
    user: { id: 456 },
    labels: [],
    body: "",
    title: "",
  };
  const feedback = createGitHubFeedbackModule({
    ...github,
    database,
    getToken: async () => "token",
    request: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/acme/feedback")) return Response.json({ id: 123 });
      if (init?.method === "POST") {
        Object.assign(issue, JSON.parse(String(init.body)));
        return Response.json(issue);
      }
      reads++;
      if (unavailable) return new Response(null, { status: 503 });
      if (hold) {
        observed?.();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return Response.json(issue);
    },
  });
  await feedback.submitPost({
    title: "A draft",
    description: "Details",
    type: "General Feedback",
    submitter: { name: "Alice", email: "alice@example.com" },
  });
  await database
    .prepare(
      "INSERT INTO integration_credentials(installation_id,portal_secret,delivery_secret,paired_at) VALUES(?,?,?,?)",
    )
    .bind(github.installationId, "a".repeat(43), "b".repeat(43), time)
    .run();
  const integration = createPortalIntegration({
    config: configuration,
    database,
    now: () => time,
  });
  expect(
    (
      await integration.handle(
        signIntegrationRequest({
          url: `${configuration.product.siteUrl}/internal/integration/delivery`,
          installationId: github.installationId,
          secret: "b".repeat(43),
          body: JSON.stringify({ eventId: "recovery", kind: "reconcile" }),
        }),
      )
    )?.status,
  ).toBe(202);
  unavailable = true;
  await integration.reconcile(feedback);
  expect(reads).toBe(3);
  await integration.reconcile(feedback);
  expect(reads).toBe(3);
  time += 70_000;
  unavailable = false;
  hold = true;
  const active = integration.reconcile(feedback);
  await started;
  await integration.reconcile(feedback);
  expect(reads).toBe(4);
  release?.();
  await active;
});
