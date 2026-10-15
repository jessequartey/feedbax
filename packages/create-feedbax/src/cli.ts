#!/usr/bin/env node
import * as prompt from "@clack/prompts";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  collectFeatureSelection,
  defaultProcessingQueueName,
  copyPackagedTemplate,
  provisionGuidedInstallation,
} from "./index";
import type { FeedbackDataSourceConfiguration } from "@feedbax/feedback";
import type { ChangelogPropertyIds } from "@feedbax/changelog";

try {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: create-feedbax [directory] [--template-only]\nGuided setup prompts for a destination, product, Notion connection, features, and deployment.\n--template-only copies source without external requests or installing dependencies.",
    );
  } else if (args.includes("--version")) {
    console.log(
      JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
      ).version,
    );
  } else {
    if (args.some((arg) => arg.startsWith("-") && arg !== "--template-only"))
      throw new Error("Unknown option. Run create-feedbax --help.");
    const destination = resolve(
      args.find((arg) => !arg.startsWith("-")) ??
        (await text("Project directory", "my-feedback")),
    );
    if (args.includes("--template-only")) {
      await copyPackagedTemplate(destination);
      console.log(`Created a flat Feedbax application in ${destination}.`);
    } else {
      prompt.intro("Create a Feedbax portal");
      const product = {
        name: await text("Product name", "My product"),
        description: await text(
          "Public description",
          "Share feedback and follow product progress.",
        ),
        siteUrl: await text(
          "Public portal URL (your workers.dev URL or custom domain)",
          "https://my-feedback.example.workers.dev",
        ),
      };
      const workerName = await text(
        "Cloudflare Worker name (choose a distinct name for this product)",
        basename(destination)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-"),
      );
      const connected = (await confirm(
        "Enable Connected Profile using your application's sign-in, dedicated D1, and a processing queue? Small processing supports Workers Free with Resend/custom email.",
        false,
      ))
        ? {
            issuer: await text("Application identity issuer (HTTPS URL)"),
            loginUrl: await text(
              "Application signed-handoff login URL (HTTPS)",
            ),
            databaseId: await text("Dedicated Cloudflare D1 database ID"),
            databaseName: await text("Dedicated Cloudflare D1 database name"),
            queueName: await text(
              "Dedicated Cloudflare Queue name (create it with wrangler queues create first)",
              defaultProcessingQueueName(workerName),
            ),
            handoffSecret: await secret(
              "Shared server-only identity handoff secret (at least 32 characters)",
            ),
          }
        : undefined;
      let email:
        | (import("@feedbax/config").EmailConfiguration & { secret?: string })
        | undefined;
      let imageBucket: string | undefined;
      if (connected) {
        const provider = await text(
          "Email sender: cloudflare, resend, custom, or none",
          "none",
        );
        if (provider !== "none") {
          if (
            provider !== "cloudflare" &&
            provider !== "resend" &&
            provider !== "custom"
          )
            throw new Error(
              "Email sender must be cloudflare, resend, custom, or none.",
            );
          email = {
            provider,
            from: await text("Verified sender email address"),
            ...(provider === "custom"
              ? { endpoint: await text("Custom HTTPS delivery endpoint") }
              : {}),
            ...(provider !== "cloudflare"
              ? { secret: await secret("Server-only email provider secret") }
              : {}),
          };
        }
        if (
          await confirm(
            "Enable Participant image attachments using an existing private R2 bucket?",
            false,
          )
        )
          imageBucket = await text(
            "Dedicated private R2 bucket name (create it in Cloudflare first)",
          );
      }
      const themePreset = await text(
        "shadcn preset code, or lyra-neutral for the included preset",
        "lyra-neutral",
      );
      const notionToken =
        process.env.NOTION_TOKEN?.trim() ||
        (await secret("Notion internal integration token"));
      const existing = await confirm(
        "Use an existing compatible Feedback Data Source?",
        false,
      );
      const feedbackSelection = existing
        ? { kind: "existing" as const, configuration: await existingFeedback() }
        : {
            kind: "create" as const,
            parentPageId: await text(
              "Notion parent page ID (share it with the integration)",
            ),
          };
      const features = await collectFeatureSelection({
        confirm: ({ message, initialValue }) => confirm(message, initialValue),
      });
      const commentProbePageId =
        existing && features.comments
          ? await text("Shared Notion page ID for checking Comment permissions")
          : undefined;
      const changelogSelection =
        features.changelog &&
        (await confirm(
          "Use an existing compatible Changelog Data Source?",
          false,
        ))
          ? {
              kind: "existing" as const,
              dataSourceId: await text("Changelog Data Source ID"),
              propertyIds: (await propertyIds([
                "title",
                "slug",
                "date",
                "summary",
                "body",
                "labels",
                "image",
                "published",
                "createdAt",
                "updatedAt",
              ])) as ChangelogPropertyIds,
            }
          : undefined;
      const turnstile = (await confirm(
        "Enable Cloudflare Turnstile? Recommended for production.",
        true,
      ))
        ? {
            siteKey: await text("Turnstile site key"),
            secretKey:
              process.env.TURNSTILE_SECRET_KEY ||
              (await secret("Turnstile secret key")),
          }
        : {};
      const result = await provisionGuidedInstallation({
        destination,
        product,
        themePreset,
        workerName,
        commentProbePageId,
        connected: connected
          ? {
              ...connected,
              ...(email ? { email } : {}),
              ...(imageBucket ? { imageBucket } : {}),
            }
          : undefined,
        features,
        feedbackSelection,
        changelogSelection,
        notionToken,
        turnstile,
        preview: (message) => confirm(message, false),
      });
      console.log(
        `Created ${destination}.\nTrusted API key — copy it now; plaintext is not stored:\n${result.apiKey}`,
      );
      await runIn(destination, "pnpm", ["install"]);
      // The included Lyra/neutral preset is already applied to the copied source.
      if (themePreset !== "lyra-neutral")
        await runIn(destination, "pnpm", [
          "dlx",
          "shadcn@latest",
          "init",
          "--preset",
          themePreset,
          "--yes",
          "--force",
        ]);
      await runIn(destination, "pnpm", [
        "exec",
        "prettier",
        "--write",
        "src/feedbax.ts",
      ]);
      if (connected) {
        if (
          !(await confirm(
            `Apply the included Connected schema migration to D1 ${connected.databaseName} (${connected.databaseId}) in your authenticated Cloudflare account?`,
            false,
          ))
        )
          throw new Error(
            "Connected source is preserved. Apply the D1 migration described in CONNECTED.md before running doctor or deploying.",
          );
        await runIn(destination, "pnpm", [
          "exec",
          "wrangler",
          "d1",
          "migrations",
          "apply",
          "FEEDBAX_DB",
          "--remote",
        ]);
      }
      await runIn(destination, "pnpm", ["exec", "feedbax", "doctor"]);
      if (
        await confirm(
          "Authenticate with Cloudflare and deploy this portal?",
          false,
        )
      ) {
        await runIn(destination, "pnpm", ["exec", "wrangler", "login"]);
        await runIn(destination, "pnpm", ["exec", "feedbax", "deploy"]);
      }
      prompt.outro(`Your portal source is ready in ${destination}.`);
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Feedbax setup failed.",
  );
  process.exitCode = 10;
}
function checked<T>(value: T): Exclude<T, symbol> {
  if (prompt.isCancel(value)) throw new Error("Setup cancelled.");
  return value as Exclude<T, symbol>;
}
async function text(message: string, defaultValue?: string): Promise<string> {
  return checked(
    await prompt.text({
      message,
      defaultValue,
      placeholder: defaultValue,
      validate: (value) =>
        value?.trim() || defaultValue ? undefined : "A value is required.",
    }),
  ).trim();
}
async function secret(message: string): Promise<string> {
  return checked(
    await prompt.password({
      message,
      validate: (value) => (value?.trim() ? undefined : "A value is required."),
    }),
  ).trim();
}
async function confirm(
  message: string,
  initialValue: boolean,
): Promise<boolean> {
  return checked(await prompt.confirm({ message, initialValue }));
}
async function propertyIds(keys: string[]) {
  const entries: [string, string][] = [];
  for (const key of keys)
    entries.push([key, await text(`Stable property ID: ${key}`)]);
  return Object.fromEntries(entries);
}
async function existingFeedback(): Promise<FeedbackDataSourceConfiguration> {
  return {
    databaseId: await text("Feedback Database ID"),
    dataSourceId: await text("Feedback Data Source ID"),
    propertyIds: (await propertyIds([
      "title",
      "slug",
      "description",
      "type",
      "status",
      "published",
      "voteCount",
      "teamResponse",
      "releaseNotesUrl",
      "submitterName",
      "submitterEmail",
      "source",
      "externalId",
      "editTokenHash",
      "createdAt",
      "updatedAt",
    ])) as FeedbackDataSourceConfiguration["propertyIds"],
  };
}
function runIn(cwd: string, command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} failed with exit code ${code}. The generated source has been preserved.`,
            ),
          ),
    );
  });
}
