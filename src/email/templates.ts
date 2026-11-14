import { CATEGORY_LABELS, STATUS_LABELS } from "../contracts/domain.ts";
import type { Category, Status } from "../contracts/domain.ts";
import type { RichText } from "../contracts/sync.ts";
import { escapeHtml, excerpt, richTextHtml } from "../server/rich-text.ts";

// Email bodies: a calm, minimal layout with a text/plain twin. Pure functions. Every value
// that came from a person (titles, names, bodies) is escaped; bodies go through
// richTextHtml, the single swap point for ticket 13's renderer.

export type Rendered = { subject: string; html: string; text: string };
export type Frame = {
  portalName: string;
  /** Why this person got the email, one sentence. */
  reason: string;
  /** The footer's "Unsubscribe" page (it asks before unsubscribing). */
  unsubscribeUrl: string;
  /** /notifications on the portal. */
  preferencesUrl: string;
};

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MUTED = "color:#71717a";
const P = "margin:0 0 12px;font-size:15px;line-height:1.6;color:#27272a";
const QUOTE = `${P};margin:0;color:#3f3f46`;

/** One line, no control characters: titles and names in subjects and headings. */
export function oneLine(value: string, max = 120): string {
  return excerpt(value.replace(/[\u0000-\u001f\u007f]/g, " "), max);
}

function layout(
  frame: Frame,
  content: {
    subject: string;
    heading: string;
    intro: string;
    quote?: { html: string; text: string };
    extraHtml?: string;
    extraText?: string;
    action: { label: string; url: string };
  },
): Rendered {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(content.subject)}</title></head><body style="margin:0;padding:0;background:#fafafa;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7"><tr><td style="padding:28px 28px 8px"><p style="margin:0 0 20px;font-size:13px;${MUTED}">${escapeHtml(frame.portalName)}</p><h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:600;color:#18181b">${escapeHtml(content.heading)}</h1><p style="${P}">${escapeHtml(content.intro)}</p>${
    content.quote
      ? `<div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #e4e4e7;background:#fafafa">${content.quote.html}</div>`
      : ""
  }${content.extraHtml ?? ""}<p style="margin:20px 0 24px"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:10px 16px;background:#18181b;color:#fafafa;text-decoration:none;font-size:14px;font-weight:500">${escapeHtml(content.action.label)}</a></p></td></tr><tr><td style="padding:16px 28px 24px;border-top:1px solid #f4f4f5;font-size:12px;line-height:1.6;${MUTED}">${escapeHtml(frame.reason)}<br><a href="${escapeHtml(frame.unsubscribeUrl)}" style="${MUTED}">Unsubscribe</a> · <a href="${escapeHtml(frame.preferencesUrl)}" style="${MUTED}">Email preferences</a></td></tr></table></td></tr></table></body></html>`;
  const text = [
    content.heading,
    "",
    content.intro,
    ...(content.quote ? ["", content.quote.text] : []),
    ...(content.extraText ? ["", content.extraText] : []),
    "",
    `${content.action.label}: ${content.action.url}`,
    "",
    "--",
    frame.reason,
    `Unsubscribe: ${frame.unsubscribeUrl}`,
    `Email preferences: ${frame.preferencesUrl}`,
    "",
  ].join("\n");
  return { subject: content.subject, html, text };
}

function quoted(body: RichText, max?: number): { html: string; text: string } {
  const value = max === undefined ? body : { ...body, text: excerpt(body.text, max) };
  return {
    html: richTextHtml(value, QUOTE),
    text: value.text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
  };
}

export function statusEmail(
  frame: Frame,
  input: { title: string; body: RichText; from: Status; to: Status; url: string; author: boolean },
): Rendered {
  const title = oneLine(input.title);
  return layout(frame, {
    subject: `${title}: now ${STATUS_LABELS[input.to]}`,
    heading: `“${title}” is now ${STATUS_LABELS[input.to]}`,
    intro: `A post you ${input.author ? "wrote" : "voted on"} moved from ${STATUS_LABELS[input.from]} to ${STATUS_LABELS[input.to]}.`,
    quote: input.body.text ? quoted(input.body, 280) : undefined,
    action: { label: "View post", url: input.url },
  });
}

export function replyEmail(
  frame: Frame,
  input: { title: string; authorName: string; body: RichText; url: string; author: boolean },
): Rendered {
  const title = oneLine(input.title);
  const name = oneLine(input.authorName, 80);
  return layout(frame, {
    subject: `New comment on “${title}”`,
    heading: `New comment on “${title}”`,
    intro: `${name} commented on a post you ${input.author ? "wrote" : "commented on"}:`,
    quote: quoted(input.body),
    action: { label: "Reply", url: input.url },
  });
}

export type DigestItem = { title: string; category: Category; body: RichText; url: string };

export function digestEmail(
  frame: Frame,
  input: { items: DigestItem[]; total: number; url: string },
): Rendered {
  const count = `${input.total} new post${input.total === 1 ? "" : "s"}`;
  const more = input.total - input.items.length;
  const extraHtml = `${input.items
    .map(
      (item) =>
        `<div style="margin:0 0 16px"><p style="margin:0 0 2px;font-size:15px;font-weight:600;line-height:1.4"><a href="${escapeHtml(item.url)}" style="color:#18181b;text-decoration:none">${escapeHtml(oneLine(item.title))}</a></p><p style="margin:0;font-size:14px;line-height:1.5;${MUTED}">${escapeHtml(CATEGORY_LABELS[item.category])}${item.body.text ? ` · ${escapeHtml(excerpt(item.body.text, 160))}` : ""}</p></div>`,
    )
    .join("")}${more > 0 ? `<p style="${P};${MUTED}">And ${more} more.</p>` : ""}`;
  const extraText = [
    ...input.items.map(
      (item) =>
        `- ${oneLine(item.title)} (${CATEGORY_LABELS[item.category]})\n  ${item.url}${item.body.text ? `\n  ${excerpt(item.body.text, 160)}` : ""}`,
    ),
    ...(more > 0 ? [`And ${more} more.`] : []),
  ].join("\n");
  return layout(frame, {
    subject: `${count} on ${oneLine(frame.portalName, 60)}`,
    heading: `${count} since the last digest`,
    intro: "The newest feedback, for admins:",
    extraHtml,
    extraText,
    action: { label: "Open moderation", url: input.url },
  });
}
