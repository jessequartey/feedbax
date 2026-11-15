import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { getEmailSettings, saveEmailPrefs } from "../../src/email/prefs.ts";
import { handleUnsubscribe } from "../../src/email/unsubscribe-route.ts";
import { unsubscribeQuery, verifyUnsubscribe } from "../../src/email/unsubscribe.ts";
import { publicConfig } from "../../src/server/auth.ts";
import { markdownToPlainText } from "../../src/lib/markdown.ts";
import { account, consume, disableEmail, enableEmail, post, stubResend } from "./helpers.ts";

const SECRET = env.BETTER_AUTH_SECRET;
const POST = "11111111-1111-4111-8111-111111111111";
const viewer = (id: string) => ({ id, name: id, kind: "account" as const });
const prefsRow = (id: string) =>
  env.DB.prepare("SELECT * FROM email_prefs WHERE user_id = ?")
    .bind(id)
    .first<Record<string, number>>();

beforeEach(async () => {
  await resetEnv();
  enableEmail();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  disableEmail();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("signed unsubscribe links", () => {
  it("verify for their own user and kind, and for nothing else", async () => {
    const query = await unsubscribeQuery(SECRET, "user-1", "replies");
    const fields = Object.fromEntries(query);
    expect(await verifyUnsubscribe(fields, SECRET)).toEqual({ userId: "user-1", kind: "replies" });
    for (const tampered of [
      { ...fields, u: "user-2" },
      { ...fields, k: "status" },
      { ...fields, t: fields.t!.replace(/.$/, fields.t!.endsWith("A") ? "B" : "A") },
      { ...fields, t: "" },
      { ...fields, t: fields.t + "A" },
      { ...fields, k: "everything" },
      { u: fields.u },
    ])
      expect(await verifyUnsubscribe(tampered, SECRET)).toBeNull();
    expect(await verifyUnsubscribe(fields, "another-secret-another-secret-another!!")).toBeNull();

    const perPost = Object.fromEntries(await unsubscribeQuery(SECRET, "user-1", "status", POST));
    expect(await verifyUnsubscribe(perPost, SECRET)).toEqual({
      userId: "user-1",
      kind: "status",
      postId: POST,
    });
    for (const badPost of [
      { ...perPost, p: "22222222-2222-4222-8222-222222222222" },
      { ...perPost, p: undefined },
      { ...fields, p: POST },
    ])
      expect(await verifyUnsubscribe(badPost as Record<string, string>, SECRET)).toBeNull();
  });

  it("is not the admin-link or session signature: the key is derived under its own context", async () => {
    const { t } = Object.fromEntries(await unsubscribeQuery(SECRET, "user-1", "status"));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const raw = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("user-1\nstatus")),
    );
    expect(Buffer.from(raw).toString("base64url")).not.toBe(t);
  });

  it("refuses an unusable secret instead of signing with it", async () => {
    await expect(unsubscribeQuery("short", "user-1", "status")).rejects.toThrow();
  });
});

describe("/api/email/unsubscribe", () => {
  const url = async (id: string, kind: "status" | "replies" | "changelog" | "digest") =>
    `http://localhost:3000/api/email/unsubscribe?${await unsubscribeQuery(SECRET, id, kind)}`;

  it("POST is the mail client's one-click: it turns that kind off, with no session", async () => {
    await account("ann");
    const response = await handleUnsubscribe(
      new Request(await url("ann", "status"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await prefsRow("ann")).toMatchObject({
      status_changes: 0,
      replies: 1,
      changelog: 0,
      digest: 1,
    });
    // Again: nothing changes, nothing fails.
    expect(
      (await handleUnsubscribe(new Request(await url("ann", "status"), { method: "POST" }))).status,
    ).toBe(200);
  });

  it("GET changes nothing (link scanners open links) and sends the person to the confirm page", async () => {
    await account("ann");
    const link = await url("ann", "replies");
    const response = await handleUnsubscribe(new Request(link));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/unsubscribe${new URL(link).search}`);
    expect(await prefsRow("ann")).toBeNull();
  });

  it("rejects a forged or damaged link and changes nothing", async () => {
    await account("ann");
    const link = new URL(await url("ann", "status"));
    link.searchParams.set("u", "bob");
    const forged = await handleUnsubscribe(new Request(link, { method: "POST" }));
    expect(forged.status).toBe(400);
    const missing = await handleUnsubscribe(
      new Request("http://localhost:3000/api/email/unsubscribe", { method: "POST" }),
    );
    expect(missing.status).toBe(400);
    expect(await prefsRow("ann")).toBeNull();
  });

  it("makes a user who unsubscribed stop getting that kind, and only that kind", async () => {
    await account("author");
    await post(POST, "author");
    await handleUnsubscribe(new Request(await url("author", "status"), { method: "POST" }));
    const sent = stubResend();
    await consume({
      type: "email.status",
      id: "s",
      post: { id: POST, title: "T", body: { markdown: "b", text: "b" } },
      from: "open",
      to: "done",
    });
    expect(sent.calls).toEqual([]);
    expect(await getEmailSettings(viewer("author"))).toMatchObject({
      prefs: { status: false, replies: true },
    });
  });

  it("a user that no longer exists is a no-op", async () => {
    const response = await handleUnsubscribe(
      new Request(await url("ghost", "status"), { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(await prefsRow("ghost")).toBeNull();
  });

  it("unfollows only that post when signed with p, leaving global preferences and other posts intact", async () => {
    const otherPost = "22222222-2222-4222-8222-222222222222";
    await account("author");
    await post(POST, "author");
    await post(otherPost, "author");
    const link = new URL("http://localhost:3000/api/email/unsubscribe");
    for (const [k, v] of await unsubscribeQuery(SECRET, "author", "status", POST))
      link.searchParams.set(k, v);
    const response = await handleUnsubscribe(new Request(link, { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await prefsRow("author")).toBeNull();
    const follow = await env.DB.prepare(
      "SELECT following FROM post_follows WHERE post_id = ? AND user_id = ?",
    )
      .bind(POST, "author")
      .first<{ following: number }>();
    expect(follow).toEqual({ following: 0 });
    const sent = stubResend();
    await consume({
      type: "email.status",
      id: "s-unfollowed",
      post: { id: POST, title: "T1", body: { markdown: "b", text: "b" } },
      from: "open",
      to: "done",
    });
    expect(sent.to()).toEqual([]);
    await consume({
      type: "email.status",
      id: "s-other",
      post: { id: otherPost, title: "T2", body: { markdown: "b", text: "b" } },
      from: "open",
      to: "done",
    });
    expect(sent.to()).toEqual(["author@example.com"]);
  });
});

describe("preferences", () => {
  it("default to status and replies on, changelog off; digest on for admins", async () => {
    await account("ann");
    expect(await getEmailSettings(viewer("ann"))).toEqual({
      enabled: true,
      address: "ann@example.com",
      admin: false,
      prefs: { status: true, replies: true, changelog: false, digest: true },
    });
  });

  it("save only what was sent, create the row lazily, and read it back", async () => {
    await account("ann");
    expect(await prefsRow("ann")).toBeNull();
    const saved = await saveEmailPrefs({ changelog: true, replies: false }, viewer("ann"));
    expect(saved.prefs).toEqual({ status: true, replies: false, changelog: true, digest: true });
    await saveEmailPrefs({ status: false }, viewer("ann"));
    expect((await getEmailSettings(viewer("ann"))).prefs).toEqual({
      status: false,
      replies: false,
      changelog: true,
      digest: true,
    });
  });

  it.each([{ nope: true }, { status: "yes" }, { status: 1 }])("refuse %j", async (input) => {
    await account("ann");
    await expect(saveEmailPrefs(input, viewer("ann"))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("show no address, and refuse saves, for anonymous visitors", async () => {
    await account("anon", { isAnonymous: true });
    await account("host", { email: "host-1@users.feedbax.invalid" });
    expect(
      (await getEmailSettings({ id: "anon", name: "Anonymous", kind: "anonymous" })).address,
    ).toBeNull();
    expect((await getEmailSettings({ id: "host", name: "H", kind: "host" })).address).toBeNull();
    await expect(
      saveEmailPrefs({ replies: false }, { id: "anon", name: "Anonymous", kind: "anonymous" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveEmailPrefs({}, null)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("reports email as off or on to the portal", () => {
    expect(publicConfig().email).toBe(true);
    delete env.RESEND_API_KEY;
    expect(publicConfig().email).toBe(false);
  });
});

describe("markdownToPlainText", () => {
  it.each([
    ["plain text is unchanged", "Please add dark mode.\nThanks!", "Please add dark mode.\nThanks!"],
    ["emphasis and code lose their marks", "**Bold**, *it* and `code`", "Bold, it and code"],
    [
      "links keep their address",
      "See [the docs](https://example.com/a)",
      "See the docs (https://example.com/a)",
    ],
    [
      "a bare link is not repeated",
      "[https://example.com](https://example.com)",
      "https://example.com",
    ],
    ["unsafe links keep only their text", "[click](javascript:alert(1))", "click"],
    ["lists", "- one\n- two\n\n1. a\n2. b", "- one\n- two\n\n1. a\n2. b"],
    ["headings and quotes", "### Title\n\n> quoted\n\nend", "Title\n\nquoted\n\nend"],
    // Horizontal rules are outside the portal's Markdown subset, so a line of dashes stays text.
    ["a line of dashes stays text", "---", "---"],
    ["code blocks keep their text", "```\nlet x = 1;\n```", "let x = 1;"],
    ["raw HTML stays literal text", "<b>hi</b><script>x</script>", "<b>hi</b><script>x</script>"],
    ["empty", "  \n ", ""],
  ])("%s", (_label, input, output) => {
    expect(markdownToPlainText(input)).toBe(output);
  });
});

it("retries an explicit email choice without rewriting it or other preferences", async () => {
  await account("retry");
  await saveEmailPrefs({ replies: false, changelog: true }, viewer("retry"), 10);
  const before = await prefsRow("retry");
  await saveEmailPrefs({ replies: false }, viewer("retry"), 20);
  expect(await prefsRow("retry")).toEqual(before);
  await saveEmailPrefs({ replies: true }, viewer("retry"), 30);
  expect(await prefsRow("retry")).toMatchObject({ replies: 1, changelog: 1, updated_at: 30 });
});
