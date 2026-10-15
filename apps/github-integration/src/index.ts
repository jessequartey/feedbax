import type { D1Database } from "@cloudflare/workers-types";
import { createIntegrationService } from "./service";
interface Environment {
  FEEDBAX_APP_DB: D1Database;
  SERVICE_ORIGIN: string;
  TRUSTED_PORTAL_ORIGINS: string;
  PORTAL_SERVICE_BINDINGS?: string;
  GITHUB_APP_ID: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  INTEGRATION_SIGNING_SECRET: string;
  PAIRING_RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
let cached: ReturnType<typeof createIntegrationService> | undefined;
function service(environment: Environment) {
  if (cached) return cached;
  const trusted = JSON.parse(environment.TRUSTED_PORTAL_ORIGINS) as unknown;
  if (
    !Array.isArray(trusted) ||
    trusted.some(
      (origin) =>
        typeof origin !== "string" ||
        !origin.startsWith("https://") ||
        new URL(origin).origin !== origin,
    )
  )
    throw new Error("Configure exact trusted portal origins.");
  const transportNames = JSON.parse(
    environment.PORTAL_SERVICE_BINDINGS ?? "{}",
  ) as Record<string, string>;
  const transports: Record<
    string,
    { fetch(request: Request): Promise<Response> }
  > = {};
  for (const [origin, name] of Object.entries(transportNames)) {
    const binding = (environment as unknown as Record<string, unknown>)[
      name
    ] as { fetch(request: Request): Promise<Response> } | undefined;
    if (
      !trusted.includes(origin) ||
      !binding ||
      typeof binding.fetch !== "function"
    )
      throw new Error("Configure the portal Service Binding.");
    transports[origin] = binding;
  }
  cached = createIntegrationService({
    database: environment.FEEDBAX_APP_DB,
    origin: environment.SERVICE_ORIGIN,
    app: {
      id: environment.GITHUB_APP_ID,
      clientId: environment.GITHUB_CLIENT_ID,
      clientSecret: environment.GITHUB_CLIENT_SECRET,
      privateKey: environment.GITHUB_APP_PRIVATE_KEY,
      webhookSecret: environment.GITHUB_WEBHOOK_SECRET,
    },
    signingSecret: environment.INTEGRATION_SIGNING_SECRET,
    trustedPortalOrigins: trusted,
    portalTransports: transports,
  });
  return cached;
}
export default {
  async fetch(request: Request, environment: Environment) {
    if (new URL(request.url).pathname === "/health")
      return Response.json(
        { status: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    try {
      if (
        ["/v1/pair", "/v1/info", "/callback"].includes(
          new URL(request.url).pathname,
        )
      ) {
        if (
          !environment.PAIRING_RATE_LIMITER ||
          !(
            await environment.PAIRING_RATE_LIMITER.limit({
              key: request.headers.get("CF-Connecting-IP") ?? "unknown",
            })
          ).success
        )
          return new Response(null, { status: 429 });
      }
      return await service(environment).fetch(request);
    } catch {
      return Response.json(
        { error: "Integration service is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  async scheduled(_event: unknown, environment: Environment) {
    if (!environment.GITHUB_APP_ID || !environment.INTEGRATION_SIGNING_SECRET)
      return;
    await service(environment).process(1);
  },
};
