import { env } from "cloudflare:workers";
import { inArray, sql } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import type { FeedbaxConfig } from "../contracts/config.ts";
import type {
  ChangelogSettings,
  ModerationSettings,
  NotificationToggles,
  RuntimeSettings,
} from "../contracts/admin.ts";
import type { Category } from "../contracts/domain.ts";
import { CATEGORY_LABELS } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { settings as settingsTable } from "../db/schema.ts";
import { invalid } from "./errors.ts";
import { cachedSettings, clearSettingsCache } from "./settings-cache.ts";

// Runtime settings: rows in the D1 `settings` table override the safe feedbax.config.ts
// fields. Anything missing or unreadable falls back to config (or the built-in default for
// fields config does not have yet). Secrets, resource IDs and integrations are never here.

export type { ChangelogSettings, NotificationToggles, RuntimeSettings };
export type SettingsPatch = {
  [K in keyof Omit<RuntimeSettings, "notifications" | "changelog" | "moderation">]?:
    | RuntimeSettings[K]
    | null;
} & {
  moderation?: { [K in keyof ModerationSettings]?: ModerationSettings[K] | null };
  notifications?: { [K in keyof NotificationToggles]?: boolean | null };
  changelog?: { [K in keyof ChangelogSettings]?: ChangelogSettings[K] | null };
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const TOGGLES = ["statusChanges", "replies", "changelog", "adminDigest"] as const;
/** Every key the settings table may hold. */
export const SETTING_KEYS = [
  "moderation.mode",
  "moderation.blockedWords",
  "moderation.allowedWords",
  "name",
  "anonymous",
  "categories",
  ...TOGGLES.map((toggle) => `notifications.${toggle}` as const),
  "changelog.autoDraft",
  "changelog.source",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Returns the parsed value, or undefined when it is not valid for `key`. */
function parse(key: SettingKey, value: unknown): unknown {
  if (key === "moderation.mode")
    return value === "off" || value === "flag" || value === "block" ? value : undefined;
  if (key === "moderation.blockedWords" || key === "moderation.allowedWords")
    return Array.isArray(value) &&
      value.length <= 100 &&
      value.every(
        (word) =>
          typeof word === "string" &&
          word.trim() === word &&
          word.length >= 1 &&
          Array.from(word).length <= 64 &&
          /[\p{L}\p{N}]/u.test(word),
      )
      ? value
      : undefined;
  if (key === "changelog.source")
    return value === "portal" || value === "github" ? value : undefined;
  if (key === "name")
    return typeof value === "string" &&
      value.trim() === value &&
      value.length >= 1 &&
      value.length <= 60
      ? value
      : undefined;
  if (key === "categories")
    return Array.isArray(value) &&
      value.length >= 1 &&
      new Set(value).size === value.length &&
      value.every((item) => ALL_CATEGORIES.includes(item as Category))
      ? (value as Category[])
      : undefined;
  return typeof value === "boolean" ? value : undefined;
}

/** Pure merge: config defaults, then every valid stored row. Invalid rows are ignored. */
export function resolveSettings(
  base: FeedbaxConfig,
  rows: { key: string; value: string }[],
): RuntimeSettings {
  const stored = new Map<string, unknown>();
  for (const row of rows) {
    if (!(SETTING_KEYS as readonly string[]).includes(row.key)) continue;
    let value: unknown;
    try {
      value = parse(row.key as SettingKey, JSON.parse(row.value));
    } catch {
      continue;
    }
    if (value !== undefined) stored.set(row.key, value);
  }
  const pick = <T>(key: SettingKey, fallback: T) =>
    stored.has(key) ? (stored.get(key) as T) : fallback;
  return {
    moderation: {
      mode: pick("moderation.mode", "flag"),
      blockedWords: pick("moderation.blockedWords", []),
      allowedWords: pick("moderation.allowedWords", []),
    },
    name: pick("name", base.name),
    anonymous: pick("anonymous", base.auth.anonymous),
    categories: pick("categories", ALL_CATEGORIES),
    notifications: Object.fromEntries(
      TOGGLES.map((toggle) => [toggle, pick(`notifications.${toggle}`, true)]),
    ) as NotificationToggles,
    changelog: {
      autoDraft: pick("changelog.autoDraft", true),
      source: base.integrations.github ? pick("changelog.source", "portal" as const) : "portal",
    },
  };
}

/** Effective runtime settings: one indexed D1 read. */
export async function readSettings(
  d1: D1Database = env.DB,
  base: FeedbaxConfig = config,
): Promise<RuntimeSettings> {
  const rows = await createDb(d1)
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(inArray(settingsTable.key, [...SETTING_KEYS]));
  return resolveSettings(base, rows);
}

/**
 * Effective settings for request handling: `readSettings` behind a short per-isolate cache
 * (settings-cache.ts), so a request does not pay a D1 read for them. If the read fails the
 * portal keeps working on feedbax.config.ts alone.
 */
export function effectiveSettings(
  d1: D1Database = env.DB,
  base: FeedbaxConfig = config,
  now = Date.now(),
): Promise<RuntimeSettings> {
  return cachedSettings(d1, base, now, () =>
    readSettings(d1, base).catch(() => resolveSettings(base, [])),
  );
}
/**
 * `feedbax.config.ts` with the runtime overrides applied: the portal name and the anonymous
 * switch. Better Auth, the write guard and the public config all decide from this, per request.
 */
export async function runtimeConfig(
  base: FeedbaxConfig = config,
  d1: D1Database = env.DB,
): Promise<FeedbaxConfig> {
  const effective = await effectiveSettings(d1, base);
  if (effective.name === base.name && effective.anonymous === base.auth.anonymous) return base;
  return { ...base, name: effective.name, auth: { ...base.auth, anonymous: effective.anonymous } };
}

/**
 * Validate and store overrides. `null` removes an override so config applies again.
 * Throws invalid_input (with the field) before writing anything if any value is invalid.
 * Callers must already have passed `requireAdmin`.
 */
export async function saveSettings(
  patch: SettingsPatch,
  d1: D1Database = env.DB,
  now = Date.now(),
): Promise<void> {
  const entries: [SettingKey, unknown][] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (key === "notifications" || key === "changelog" || key === "moderation") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(key);
      for (const [toggle, enabled] of Object.entries(value))
        entries.push([`${key}.${toggle}` as SettingKey, enabled]);
    } else entries.push([key as SettingKey, value]);
  }
  for (const [key, value] of entries)
    if (
      !(SETTING_KEYS as readonly string[]).includes(key) ||
      (value !== null && parse(key, value) === undefined)
    )
      invalid(key);
  if (
    patch.changelog?.source === "github" &&
    (!config.integrations.github || !env.GITHUB_TOKEN?.trim())
  )
    invalid("changelog.source");
  const db = createDb(d1);
  const removals = entries.filter(([, value]) => value === null).map(([key]) => key);
  const upserts = entries
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ key, value: JSON.stringify(value), updatedAt: now }));
  const statements = [
    ...(removals.length
      ? [db.delete(settingsTable).where(inArray(settingsTable.key, removals))]
      : []),
    ...(upserts.length
      ? [
          db
            .insert(settingsTable)
            .values(upserts)
            .onConflictDoUpdate({
              target: settingsTable.key,
              set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
              // A retry of the same explicit value is a no-op, including its timestamp.
              setWhere: sql`${settingsTable.value} != excluded.value`,
            }),
        ]
      : []),
  ];
  if (statements.length) await db.batch(statements as [(typeof statements)[number]]);
  clearSettingsCache();
}
