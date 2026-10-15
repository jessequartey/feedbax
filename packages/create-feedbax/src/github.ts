import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  defineFeedbax,
  type GitHubConfiguration,
  type PortalFeatures,
} from "@feedbax/config";
import { copyPackagedTemplate } from "./template";
import type { provisionGuidedInstallation } from "./index";

type ConnectedSetup = NonNullable<
  Parameters<typeof provisionGuidedInstallation>[0]["connected"]
>;
export async function provisionGitHubInstallation(options: {
  destination: string;
  product: { name: string; description: string; siteUrl: string };
  workerName: string;
  database: { id: string; name: string };
  github: GitHubConfiguration;
  features: PortalFeatures;
  connected?: ConnectedSetup;
  turnstile?: { siteKey?: string; secretKey?: string };
  preview(message: string): Promise<boolean>;
}) {
  const { connected, github } = options;
  if (
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(options.workerName) ||
    !/^[0-9a-f-]{36}$/i.test(options.database.id) ||
    !options.database.name.trim()
  )
    throw new Error(
      "GitHub setup requires a distinct Worker and an explicitly provisioned FEEDBAX_DB D1 database.",
    );
  if (
    connected &&
    (connected.databaseId !== options.database.id ||
      connected.handoffSecret.length < 32 ||
      (connected.processing !== "standard" && !connected.queueName))
  )
    throw new Error(
      "Connected setup requires the same D1 database, a handoff secret, and an existing processing queue for small processing.",
    );
  if (
    connected?.imageBucket &&
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(connected.imageBucket)
  )
    throw new Error("Use a dedicated private R2 bucket for images.");
  const config = defineFeedbax({
    provider: "github",
    github,
    product: { ...options.product, logo: "/feedbax-mark.svg" },
    theme: { preset: "lyra-neutral" },
    features: options.features,
    ...(connected
      ? {
          connected: {
            processing: connected.processing ?? "small",
            issuer: connected.issuer,
            loginUrl: connected.loginUrl,
            ...(connected.imageBucket ? { images: true } : {}),
            ...(connected.email
              ? {
                  email: {
                    provider: connected.email.provider,
                    from: connected.email.from,
                    ...(connected.email.endpoint
                      ? { endpoint: connected.email.endpoint }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    submissions: {
      moderation: "required",
      maxTitleLength: 160,
      maxDescriptionLength: 5000,
    },
    turnstile: {
      enabled: Boolean(options.turnstile?.siteKey),
      ...(options.turnstile?.siteKey
        ? { siteKey: options.turnstile.siteKey }
        : {}),
    },
  });
  if (
    !(await options.preview(
      "Create GitHub-backed portal source and private pairing secrets. GitHub requires D1 independently of sign-in. If the repository is public, issue titles/bodies are public immediately even while portal Posts await moderation. This does not create issues, pair the App, or deploy.",
    ))
  )
    throw new Error("GitHub setup was not approved.");
  await copyPackagedTemplate(options.destination);
  const path = join(options.destination, "wrangler.jsonc");
  const base = JSON.parse(await readFile(path, "utf8"));
  const wrangler = {
    ...base,
    name: options.workerName,
    compatibility_flags: [
      ...new Set([
        ...(base.compatibility_flags ?? []),
        "global_fetch_strictly_public",
      ]),
    ],
    d1_databases: [
      {
        binding: "FEEDBAX_DB",
        database_id: options.database.id,
        database_name: options.database.name,
        migrations_dir: "migrations",
      },
    ],
    triggers: { crons: ["*/5 * * * *"] },
    ...(connected?.queueName
      ? {
          queues: {
            producers: [
              { binding: "FEEDBAX_UPDATES", queue: connected.queueName },
            ],
            consumers: [
              {
                queue: connected.queueName,
                max_batch_size: 1,
                max_concurrency: 1,
                max_retries: 3,
                retry_delay: 60,
              },
            ],
          },
        }
      : {}),
    ...(connected?.imageBucket
      ? {
          r2_buckets: [
            { binding: "FEEDBAX_IMAGES", bucket_name: connected.imageBucket },
          ],
        }
      : {}),
    ...(connected?.email?.provider === "cloudflare"
      ? {
          send_email: [
            {
              name: "FEEDBAX_EMAIL",
              allowed_sender_addresses: [connected.email.from],
            },
          ],
        }
      : {}),
  };
  const apiKey = randomBytes(32).toString("base64url");
  const pairingSecret = randomBytes(32).toString("base64url");
  const secrets = {
    FEEDBAX_API_KEY_HASH: createHash("sha256")
      .update(apiKey)
      .digest("base64url"),
    PARTICIPATION_SIGNING_SECRET: randomBytes(32).toString("base64url"),
    GITHUB_PAIRING_SECRET: pairingSecret,
    ...(connected ? { IDENTITY_HANDOFF_SECRET: connected.handoffSecret } : {}),
    ...(connected?.email?.secret
      ? { EMAIL_PROVIDER_SECRET: connected.email.secret }
      : {}),
    ...(options.turnstile?.secretKey
      ? { TURNSTILE_SECRET_KEY: options.turnstile.secretKey }
      : {}),
  };
  await writeFile(path, JSON.stringify(wrangler, null, 2) + "\n");
  await writeFile(
    join(options.destination, "src/feedbax.ts"),
    `import { defineFeedbax } from "@feedbax/config";\n\nexport default defineFeedbax(${JSON.stringify(config, null, 2)});\n`,
  );
  await writeFile(
    join(options.destination, ".dev.vars"),
    Object.entries(secrets)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  return { apiKey, pairingSecret, configuration: config };
}
