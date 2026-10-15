import type { D1Database } from "@cloudflare/workers-types";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  randomBytes,
} from "node:crypto";
import {
  boundedBody,
  equalSignature,
  signIntegrationRequest,
  verifyIntegrationRequest,
} from "../../../packages/feedback/src/integration-auth";

import { createDeliveryModule } from "./delivery";
import { bindingSecret } from "./binding-secret";

export interface IntegrationServiceOptions {
  database: D1Database;
  origin: string;
  app: {
    id: string;
    clientId: string;
    clientSecret: string;
    privateKey: string;
    webhookSecret: string;
  };
  signingSecret: string;
  trustedPortalOrigins: string[];
  portalTransports?: Record<
    string,
    { fetch(request: Request): Promise<Response> }
  >;
  request?: typeof fetch;
}
interface Binding {
  installation_id: string;
  origin: string;
  github_installation_id: number;
  repository_id: number;
  repository_owner: string;
  repository_name: string;
  bot_user_id: number;
  key_version: number;
  active: number;
}
interface Pairing {
  state: string;
  installation_id: string;
  origin: string;
  github_installation_id: number;
  repository_id: number;
  sealed_secret: string;
  expires_at: number;
  consumed: number;
}
export function createIntegrationService(options: IntegrationServiceOptions) {
  if (
    new URL(options.origin).origin !== options.origin ||
    !options.origin.startsWith("https://") ||
    options.signingSecret.length < 32
  )
    throw new Error(
      "Configure an HTTPS integration origin and an independent signing secret.",
    );
  const database = options.database;
  const request = options.request ?? fetch;
  const portalRequest = (origin: string, input: Request) => {
    if (!options.trustedPortalOrigins.includes(origin))
      throw new Error("Untrusted portal destination.");
    const transport = options.portalTransports?.[origin];
    if (transport) return transport.fetch(input);
    // Platform-owned worker hostnames cannot rebind to private networks. Custom
    // domains require an operator-configured Service Binding, never arbitrary DNS.
    if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin))
      throw new Error(
        "Custom portal domains require a Service Binding transport.",
      );
    return request(input);
  };
  const delivery = createDeliveryModule({
    database,
    appId: options.app.id,
    webhookSecret: options.app.webhookSecret,
    signingSecret: options.signingSecret,
    deliver: portalRequest,
  });
  const github = async (
    path: string,
    token: string | undefined,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await request(`https://api.github.com${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "Feedbax",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error("GitHub authorization is unavailable.");
    return (await response.json()) as Record<string, unknown>;
  };
  const appJwt = () => {
    const now = Math.floor(Date.now() / 1000);
    const encoded = [
      Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({ iat: now - 60, exp: now + 540, iss: options.app.id }),
      ).toString("base64url"),
    ].join(".");
    return `${encoded}.${createSign("RSA-SHA256").update(encoded).sign(options.app.privateKey).toString("base64url")}`;
  };
  const appIdentity = async (userToken?: string) => {
    const app = await github("/app", appJwt());
    if (typeof app.slug !== "string" || !/^[a-zA-Z0-9-]+$/.test(app.slug))
      throw new Error("Invalid App identity.");
    const bot = await github(
      `/users/${encodeURIComponent(`${app.slug}[bot]`)}`,
      userToken,
    );
    if (!positive(bot.id)) throw new Error("Invalid App bot identity.");
    return { appSlug: app.slug, botUserId: Number(bot.id) };
  };
  const tokenFor = async (binding: Binding) => {
    const token = await github(
      `/app/installations/${binding.github_installation_id}/access_tokens`,
      appJwt(),
      "POST",
      {
        repository_ids: [binding.repository_id],
        permissions: { issues: "write", metadata: "read" },
      },
    );
    if (
      typeof token.token !== "string" ||
      typeof token.expires_at !== "string" ||
      !Number.isFinite(Date.parse(token.expires_at)) ||
      Date.parse(token.expires_at) <= Date.now()
    )
      throw new Error("Invalid installation access.");
    const repository = await github(
      `/repos/${binding.repository_owner}/${binding.repository_name}`,
      token.token,
    );
    if (repository.id !== binding.repository_id)
      throw new Error("Repository identity changed.");
    return {
      token: token.token,
      expiresAt: token.expires_at,
      repositoryId: binding.repository_id,
      botUserId: binding.bot_user_id,
    };
  };
  const authenticate = async (input: Request, body: string) => {
    const id = input.headers.get("X-Feedbax-Installation") ?? "";
    const binding = await database
      .prepare(
        "SELECT * FROM portal_bindings WHERE installation_id=? AND active=1",
      )
      .bind(id)
      .first<Binding>();
    if (
      !binding ||
      !verifyIntegrationRequest(
        input,
        body,
        bindingSecret(options.signingSecret, binding, "portal"),
      )
    )
      return;
    const result = await database
      .prepare(
        "INSERT OR IGNORE INTO integration_nonces(installation_id,nonce,expires_at) VALUES(?,?,?)",
      )
      .bind(id, input.headers.get("X-Feedbax-Nonce"), Date.now() + 600_000)
      .run();
    return result.meta.changes === 1 ? binding : undefined;
  };
  const beginPairing = async (input: Request) => {
    const body = JSON.parse(await boundedBody(input, 4096)) as Record<
      string,
      unknown
    >;
    if (
      typeof body.installationId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(body.installationId) ||
      typeof body.origin !== "string" ||
      !options.trustedPortalOrigins.includes(body.origin) ||
      new URL(body.origin).origin !== body.origin ||
      !positive(body.repositoryId) ||
      !positive(body.githubInstallationId) ||
      typeof body.pairingSecret !== "string" ||
      body.pairingSecret.length < 32 ||
      body.pairingSecret.length > 256
    )
      return json(
        { error: "Invalid pairing configuration or untrusted portal origin." },
        400,
      );
    const state = randomBytes(32).toString("base64url");
    await database
      .prepare(
        "INSERT INTO pairing_attempts(state,installation_id,origin,github_installation_id,repository_id,sealed_secret,expires_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        state,
        body.installationId,
        body.origin,
        body.githubInstallationId,
        body.repositoryId,
        seal(body.pairingSecret, options.signingSecret),
        Date.now() + 600_000,
      )
      .run();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", options.app.clientId);
    authorize.searchParams.set("redirect_uri", `${options.origin}/callback`);
    authorize.searchParams.set("state", state);
    return json({ authorizeUrl: authorize.href });
  };
  const completePairing = async (url: URL) => {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (
      !state ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !code ||
      code.length > 512
    )
      return json({ error: "Invalid or expired pairing." }, 400);
    const pair = await database
      .prepare(
        "SELECT * FROM pairing_attempts WHERE state=? AND consumed=0 AND expires_at>?",
      )
      .bind(state, Date.now())
      .first<Pairing>();
    if (!pair) return json({ error: "Invalid or expired pairing." }, 400);
    const claimed = await database
      .prepare(
        "UPDATE pairing_attempts SET consumed=1,sealed_secret=NULL WHERE state=? AND consumed=0",
      )
      .bind(state)
      .run();
    if (claimed.meta.changes !== 1)
      return json({ error: "Invalid or expired pairing." }, 400);
    let phase = "github_authorization";
    try {
      const oauth = await request(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          redirect: "manual",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: options.app.clientId,
            client_secret: options.app.clientSecret,
            code,
            redirect_uri: `${options.origin}/callback`,
          }),
        },
      );
      const granted = (await oauth.json()) as { access_token?: unknown };
      if (!oauth.ok || typeof granted.access_token !== "string")
        throw new Error("GitHub authorization failed.");
      phase = "repository_access";
      let repository:
        { id: number; name: string; owner: { login: string } } | undefined;
      for (let page = 1; page <= 10; page++) {
        const list = await github(
          `/user/installations/${pair.github_installation_id}/repositories?per_page=100&page=${page}`,
          granted.access_token,
        );
        if (!Array.isArray(list.repositories))
          throw new Error("Invalid repository access.");
        repository = list.repositories.find(
          (item) => item.id === pair.repository_id,
        );
        if (repository || list.repositories.length < 100) break;
      }
      if (
        !repository ||
        !/^[A-Za-z0-9-]+$/.test(repository.owner.login) ||
        !/^[A-Za-z0-9_.-]+$/.test(repository.name)
      )
        return json(
          {
            error:
              "Repository is not accessible to this authorized installation.",
          },
          403,
        );
      const userRepo = await github(
        `/repos/${repository.owner.login}/${repository.name}`,
        granted.access_token,
      );
      const permissions = userRepo.permissions as
        Record<string, unknown> | undefined;
      if (
        userRepo.id !== pair.repository_id ||
        !permissions ||
        ![permissions.admin, permissions.maintain, permissions.push].includes(
          true,
        )
      )
        return json(
          { error: "Repository write access is required for pairing." },
          403,
        );
      const previous = await database
        .prepare("SELECT * FROM portal_bindings WHERE installation_id=?")
        .bind(pair.installation_id)
        .first<Binding>();
      if (
        previous &&
        (previous.origin !== pair.origin ||
          previous.repository_id !== pair.repository_id ||
          previous.github_installation_id !== pair.github_installation_id)
      )
        return json(
          {
            error:
              "This Installation identifier is already bound to different resources. Use a distinct Installation identifier.",
          },
          403,
        );
      const version = (previous?.key_version ?? 0) + 1;
      phase = "app_identity";
      const identity = await appIdentity(granted.access_token);
      const binding: Binding = {
        installation_id: pair.installation_id,
        origin: pair.origin,
        github_installation_id: pair.github_installation_id,
        repository_id: pair.repository_id,
        repository_owner: repository.owner.login,
        repository_name: repository.name,
        bot_user_id: identity.botUserId,
        key_version: version,
        active: 1,
      };
      phase = "repository_token";
      await tokenFor(binding);
      const pairingSecret = unseal(pair.sealed_secret, options.signingSecret);
      const credentials = {
        portalSecret: bindingSecret(options.signingSecret, binding, "portal"),
        deliverySecret: bindingSecret(
          options.signingSecret,
          binding,
          "service",
        ),
      };
      phase = "portal_control";
      const proof = await portalRequest(
        pair.origin,
        signIntegrationRequest({
          url: `${pair.origin}/internal/integration/pair`,
          installationId: pair.installation_id,
          secret: pairingSecret,
          body: JSON.stringify({
            challenge: state,
            repositoryId: pair.repository_id,
            botUserId: identity.botUserId,
            credentials,
          }),
        }),
      );
      const result = (await proof.json()) as { proof?: unknown };
      const expected = createHmac("sha256", pairingSecret)
        .update(
          JSON.stringify([
            "feedbax-pair-v1",
            pair.installation_id,
            pair.origin,
            options.origin,
            state,
          ]),
        )
        .digest("hex");
      if (
        !proof.ok ||
        typeof result.proof !== "string" ||
        !equalSignature(result.proof, expected)
      )
        return json({ error: "Portal control could not be verified." }, 403);
      phase = "binding_activation";
      const activated = await database
        .prepare(
          "INSERT INTO portal_bindings(installation_id,origin,github_installation_id,repository_id,repository_owner,repository_name,bot_user_id,key_version,active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?) ON CONFLICT(installation_id) DO UPDATE SET origin=excluded.origin,github_installation_id=excluded.github_installation_id,repository_id=excluded.repository_id,repository_owner=excluded.repository_owner,repository_name=excluded.repository_name,bot_user_id=excluded.bot_user_id,key_version=excluded.key_version,active=1 WHERE portal_bindings.origin=excluded.origin AND portal_bindings.repository_id=excluded.repository_id AND portal_bindings.github_installation_id=excluded.github_installation_id AND portal_bindings.key_version=excluded.key_version-1",
        )
        .bind(
          binding.installation_id,
          binding.origin,
          binding.github_installation_id,
          binding.repository_id,
          binding.repository_owner,
          binding.repository_name,
          binding.bot_user_id,
          binding.key_version,
          Date.now(),
        )
        .run();
      if (activated.meta.changes !== 1)
        return json(
          {
            error: "Pairing authority changed. Start a fresh pairing exchange.",
          },
          409,
        );
      return json({ paired: true });
    } catch {
      return json(
        {
          error:
            "Pairing could not finish. Start a fresh exchange after correcting the indicated step.",
          code: `pairing_${phase}_failed`,
        },
        503,
      );
    }
  };
  return {
    process: delivery.process,
    async fetch(input: Request): Promise<Response> {
      try {
        const url = new URL(input.url);
        if (url.origin !== options.origin)
          return json({ error: "Not found." }, 404);
        if (input.method === "GET" && url.pathname === "/health")
          return json({ status: "ok" });
        if (input.method === "GET" && url.pathname === "/v1/info")
          return json(await appIdentity());
        if (input.method === "POST" && url.pathname === "/v1/pair")
          return await beginPairing(input);
        if (input.method === "GET" && url.pathname === "/callback")
          return await completePairing(url);
        if (
          input.method === "POST" &&
          ["/v1/token", "/v1/revoke", "/v1/status"].includes(url.pathname)
        ) {
          const body = await boundedBody(input, 4096);
          const binding = await authenticate(input, body);
          if (!binding) return json({ error: "Unauthorized." }, 401);
          if (url.pathname === "/v1/status")
            return json(await delivery.status(binding.installation_id));
          if (url.pathname === "/v1/revoke") {
            const time = Date.now();
            await database.batch([
              database
                .prepare(
                  "UPDATE portal_bindings SET active=0 WHERE installation_id=? AND key_version=?",
                )
                .bind(binding.installation_id, binding.key_version),
              database
                .prepare(
                  "INSERT OR IGNORE INTO portal_work(id,app_id,installation_id,kind,priority,next_attempt,created_at,binding_version) SELECT ?,?,?,'revoke',3,?,?,? WHERE EXISTS(SELECT 1 FROM portal_bindings WHERE installation_id=? AND key_version=? AND active=0)",
                )
                .bind(
                  `revoke:${binding.installation_id}:${binding.key_version}`,
                  options.app.id,
                  binding.installation_id,
                  time,
                  time,
                  binding.key_version,
                  binding.installation_id,
                  binding.key_version,
                ),
            ]);
            return json({ revoked: true });
          }
          return json(await tokenFor(binding));
        }
        if (input.method === "POST" && url.pathname === "/webhooks/github")
          return delivery.ingest(input);
        return json({ error: "Not found." }, 404);
      } catch {
        return json(
          {
            error:
              "Integration request failed. Retry pairing or check service diagnostics.",
          },
          503,
        );
      }
    },
  };
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
function positive(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function seal(secret: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(key).digest(),
    iv,
  );
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
function unseal(value: string, key: string) {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(key).digest(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
