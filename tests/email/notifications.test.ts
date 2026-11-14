import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import { flushWaitUntil, resetEnv } from "../fixtures/cloudflare-workers.ts";
import type { EmailMessage } from "../../src/contracts/sync.ts";
import { richText } from "../../src/email/content.ts";
import { statusEmails } from "../../src/email/events.ts";
import { addCommentForUser } from "../../src/server/comments.ts";
import { saveSettings } from "../../src/server/settings.ts";
import { runScheduled } from "../../src/sync/index.ts";
import {
  account,
  comment,
  consume,
  disableEmail,
  enableEmail,
  FROM,
  post,
  queued,
  setPrefs,
  stubResend,
  vote,
} from "./helpers.ts";

const POST = "11111111-1111-4111-8111-111111111111";
const COMMENT = "33333333-3333-4333-8333-333333333333";

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

const statusMessage = (patch: Partial<Extract<EmailMessage, { type: "email.status" }>> = {}) =>
  ({
    type: "email.status",
    id: "status-1",
    post: { id: POST, title: "Export to CSV", body: richText("Please export my data.") },
    from: "open",
    to: "planned",
    ...patch,
  }) as EmailMessage;

describe("off by default", () => {
  it.each([
    ["no Resend key", () => delete env.RESEND_API_KEY],
    ["no from-address", () => (config.notifications.email = false)],
  ])("with %s nothing is queued or sent", async (_label, turnOff) => {
    const author = await account("author");
    await post(POST, author);
    await account("replier");
    turnOff();
    const sent = stubResend();

    expect(
      statusEmails([{ post: { id: POST, title: "T", body: "B" }, from: "open", to: "done" }]),
    ).toEqual([]);
    await addCommentForUser(
      { id: COMMENT, postId: POST, body: "Hello" },
      { id: "replier", name: "Rae", kind: "account" },
    );
    await runScheduled({
      scheduledTime: Date.parse("2026-11-14T12:00:00Z"),
    } as ScheduledController);
    await flushWaitUntil();
    expect(queued()).toEqual([]);

    const { ack } = await consume(statusMessage());
    expect(ack).toHaveBeenCalledOnce();
    expect(sent.calls).toEqual([]);
  });

  it("drops a message that was queued before email was turned off", async () => {
    const author = await account("author");
    await post(POST, author);
    disableEmail();
    const sent = stubResend();
    const { ack } = await consume(statusMessage());
    expect(ack).toHaveBeenCalledOnce();
    expect(sent.calls).toEqual([]);
  });
});

describe("status changes", () => {
  it("emails the author and voters who have a known address, nobody else", async () => {
    const author = await account("author");
    await post(POST, author);
    await account("voter");
    await account("anon", { isAnonymous: true, email: "anon@example.com" });
    await account("banned", { bannedAt: 5 });
    await account("unverified", { emailVerified: false });
    await account("host", { email: "host-abc@users.feedbax.invalid" });
    await account("builtin", { email: "admin@users.feedbax.invalid" });
    await account("optedout");
    await account("stranger");
    for (const id of ["voter", "anon", "banned", "unverified", "host", "builtin", "optedout"])
      await vote(POST, id);
    await setPrefs("optedout", { status_changes: 0 });
    const sent = stubResend();

    const { ack } = await consume(statusMessage());

    expect(ack).toHaveBeenCalledOnce();
    expect(sent.to()).toEqual(["author@example.com", "voter@example.com"]);
    const mail = sent.emails().find((email) => email.to[0] === "author@example.com")!;
    expect(mail.from).toBe(FROM);
    expect(mail.subject).toBe("Export to CSV: now Planned");
    expect(mail.text).toContain("Planned");
    expect(mail.html).toContain("View post");
  });

  it("sends nothing for a hidden, spam or merged post", async () => {
    const author = await account("author");
    await post(POST, author, { hiddenAt: 5 });
    const sent = stubResend();
    const { ack } = await consume(statusMessage());
    expect(ack).toHaveBeenCalledOnce();
    expect(sent.calls).toEqual([]);
  });

  it("respects the admin's site switch", async () => {
    const author = await account("author");
    await post(POST, author);
    await saveSettings({ notifications: { statusChanges: false } });
    const sent = stubResend();
    await consume(statusMessage());
    expect(sent.calls).toEqual([]);
  });

  it("is queued when Notion moves a post, with Markdown plus plain text", async () => {
    const [message] = statusEmails([
      {
        post: { id: POST, title: "T", body: "**Bold** and [a link](https://example.com)" },
        from: "open",
        to: "done",
      },
    ]);
    expect(message).toMatchObject({
      type: "email.status",
      post: {
        body: {
          markdown: "**Bold** and [a link](https://example.com)",
          text: "Bold and a link (https://example.com)",
        },
      },
    });
    expect(
      statusEmails([{ post: { id: POST, title: "T", body: "B" }, from: "done", to: "done" }]),
    ).toEqual([]);
  });
});

describe("every email", () => {
  it("has a signed one-click unsubscribe, a text part, and its own link per person", async () => {
    const author = await account("author");
    await post(POST, author);
    await account("voter");
    await vote(POST, "voter");
    const sent = stubResend();
    await consume(statusMessage());
    const emails = sent.emails();
    expect(emails).toHaveLength(2);
    const links = new Set<string>();
    for (const email of emails) {
      const header = email.headers["List-Unsubscribe"]!;
      expect(header).toMatch(
        /^<http:\/\/localhost:3000\/api\/email\/unsubscribe\?u=[^>]+&k=status&t=[A-Za-z0-9_-]{43}>$/,
      );
      expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      links.add(header);
      expect(email.text.length).toBeGreaterThan(0);
      expect(email.text).toContain("Unsubscribe: http://localhost:3000/unsubscribe?u=");
      expect(email.html).toContain("Unsubscribe</a>");
    }
    expect(links.size).toBe(2);
    const call = sent.calls[0]!;
    expect(call.headers.get("authorization")).toBe("Bearer re_test_only_not_a_real_key");
    expect(call.headers.get("idempotency-key")).toBe("feedbax/status-1/-/0");
  });

  it("shows user content as escaped text, never as HTML", async () => {
    const author = await account("author", { name: "<b>Ada</b>" });
    await post(POST, author);
    const sent = stubResend();
    const hostile =
      '<script>alert(1)</script><img src=x onerror="steal()"> [x](javascript:alert(1))';
    await consume(
      statusMessage({
        post: {
          id: POST,
          title: '<img src=x onerror=alert(1)> "quoted" & title',
          body: richText(hostile),
        },
      }),
    );
    const [mail] = sent.emails();
    expect(mail!.html).not.toMatch(/<script|<img|href="javascript:/i);
    // The only tags are the template's own: user text never opens one.
    expect(mail!.html.match(/<img|<script|<iframe|<svg/gi)).toBeNull();
    expect(mail!.text).not.toContain("javascript:");
    expect(mail!.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(mail!.html).toContain("&lt;img src=x onerror=&quot;steal()&quot;&gt;");
    expect(mail!.text).toContain("<script>alert(1)</script>");
    expect(mail!.subject).not.toMatch(/[\r\n]/);
  });

  it("strips line breaks from a title in the subject", async () => {
    const author = await account("author");
    await post(POST, author);
    const sent = stubResend();
    await consume(
      statusMessage({ post: { id: POST, title: "A\r\nBcc: x@evil.test", body: richText("b") } }),
    );
    expect(sent.emails()[0]!.subject).toBe("A Bcc: x@evil.test: now Planned");
  });
});

describe("replies", () => {
  it("is queued by a new comment and goes to the post's author and earlier commenters, not the commenter", async () => {
    const author = await account("author");
    await post(POST, author);
    await account("earlier");
    await account("later");
    await account("replier");
    await comment("c-early", POST, "earlier", 10);
    await comment("c-same", POST, "replier", 11);
    const viewer = { id: "replier", name: "Rae", kind: "account" } as const;
    await addCommentForUser({ id: COMMENT, postId: POST, body: "Thanks, **fixed**" }, viewer);
    await flushWaitUntil();
    const [message] = queued();
    expect(message).toMatchObject({
      type: "email.reply",
      post: { id: POST, title: "Export to CSV" },
      comment: {
        id: COMMENT,
        authorId: "replier",
        body: { markdown: "Thanks, **fixed**", text: "Thanks, fixed" },
      },
    });
    // A comment that arrives after this one is not a recipient of it.
    await comment("c-late", POST, "later", Date.now() + 60_000);
    const sent = stubResend();
    await consume(message!);
    expect(sent.to()).toEqual(["author@example.com", "earlier@example.com"]);
    const mail = sent.emails().find((email) => email.to[0] === "earlier@example.com")!;
    expect(mail.subject).toBe("New comment on “Export to CSV”");
    expect(mail.html).toContain("Thanks, fixed");
  });
});
