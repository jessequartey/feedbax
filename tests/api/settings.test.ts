import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import config from "../../feedbax.config.ts";
import { readSettings, resolveSettings, saveSettings } from "../../src/server/settings.ts";

beforeEach(resetEnv);
const defaults = {
  moderation: { mode: "flag", blockedWords: [], allowedWords: [] },
  name: config.name,
  anonymous: config.auth.anonymous,
  categories: ["feature", "bug", "general"],
  notifications: { statusChanges: true, replies: true, changelog: true, adminDigest: true },
  changelog: { autoDraft: true },
};
const store = (key: string, value: string) =>
  env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0)")
    .bind(key, value)
    .run();

it("falls back to feedbax.config.ts when nothing is stored", async () => {
  expect(await readSettings()).toEqual(defaults);
  const custom = { ...config, name: "Acme", auth: { anonymous: true } };
  expect(await readSettings(env.DB, custom)).toMatchObject({ name: "Acme", anonymous: true });
});
it("D1 settings override the safe config fields", async () => {
  await saveSettings({
    name: "Acme Feedback",
    anonymous: !config.auth.anonymous,
    categories: ["bug", "feature"],
    notifications: { changelog: false },
    changelog: { autoDraft: false },
  });
  expect(await readSettings()).toEqual({
    moderation: defaults.moderation,
    name: "Acme Feedback",
    anonymous: !config.auth.anonymous,
    categories: ["bug", "feature"],
    notifications: { ...defaults.notifications, changelog: false },
    changelog: { autoDraft: false },
  });
  // Overrides win over a different config too, and are updated in place.
  await saveSettings({ name: "Renamed" });
  expect(await readSettings(env.DB, { ...config, name: "From config" })).toMatchObject({
    name: "Renamed",
  });
  expect(await env.DB.prepare("SELECT count(*) AS n FROM settings").first("n")).toBe(5);
});
it("null clears an override so config applies again", async () => {
  await saveSettings({ name: "Acme", notifications: { replies: false } });
  await saveSettings({ name: null, notifications: { replies: null } });
  expect(await readSettings()).toEqual(defaults);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM settings").first("n")).toBe(0);
});
it.each([
  [{ name: "" }, "name"],
  [{ name: "x".repeat(61) }, "name"],
  [{ name: 42 }, "name"],
  [{ anonymous: "yes" }, "anonymous"],
  [{ categories: [] }, "categories"],
  [{ categories: ["feature", "feature"] }, "categories"],
  [{ categories: ["roadmap"] }, "categories"],
  [{ notifications: { replies: 1 } }, "notifications.replies"],
  [{ notifications: { unknown: true } }, "notifications.unknown"],
  [{ notifications: true }, "notifications"],
  [{ changelog: { autoDraft: "yes" } }, "changelog.autoDraft"],
  [{ changelog: { other: true } }, "changelog.other"],
  [{ changelog: true }, "changelog"],
  [{ secret: "x" }, "secret"],
])("rejects %j without writing anything", async (patch, field) => {
  await expect(saveSettings({ name: "Valid", ...patch } as never)).rejects.toMatchObject({
    code: "invalid_input",
    field,
  });
  expect(await env.DB.prepare("SELECT count(*) AS n FROM settings").first("n")).toBe(0);
});
it("ignores unknown keys and corrupt or invalid stored values", async () => {
  await store("name", "not json");
  await store("anonymous", '"true"');
  await store("categories", '["nope"]');
  await store("notifications.replies", "false");
  await store("changelog.autoDraft", '"off"');
  await store("NOTION_TOKEN", '"leak"');
  expect(await readSettings()).toEqual({
    ...defaults,
    notifications: { ...defaults.notifications, replies: false },
  });
});
it("resolveSettings is a pure merge", () => {
  expect(resolveSettings(config, [{ key: "name", value: '"Pure"' }])).toEqual({
    ...defaults,
    name: "Pure",
  });
});
