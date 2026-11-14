import { vi } from "vite-plus/test";
import type { FetchFn } from "../../src/contracts/integrations.ts";

export type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
};
export function fakeFetch(...replies: unknown[]) {
  const requests: RecordedRequest[] = [];
  const fetch: FetchFn = vi.fn(async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (!replies.length) throw new Error("Unexpected fetch");
    let next = replies.shift();
    if (typeof next === "function") next = await next();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next);
  });
  return { fetch, requests, remaining: () => replies.length };
}
export const ID = "11111111-1111-4111-8111-111111111111";
export const PAGE = "22222222-2222-4222-8222-222222222222";
export const SOURCE = "00000000-0000-0000-0000-000000000000";
export const DATABASE = "33333333-3333-4333-8333-333333333333";
export const PARENT = "44444444-4444-4444-8444-444444444444";
export const UNTIL = "2026-11-14T12:00:00.000Z";
export const SINCE = "2026-11-14T11:00:00.000Z";
export const list = (results: unknown[] = [], next: string | null = null) => ({
  results,
  has_more: next !== null,
  next_cursor: next,
});
export const text = (content: string) => [{ text: { content } }];
export const notionRow = (
  status: string | null = "Open",
  approved = false,
  id = ID,
  pageId = PAGE,
) => ({
  id: pageId,
  url: `https://notion.so/${pageId}`,
  in_trash: false,
  properties: {
    Name: { type: "title", title: text("Post") },
    "Feedbax ID": { type: "rich_text", rich_text: text(id) },
    Status: { type: "select", select: status ? { name: status } : null },
    "Send to GitHub": { type: "checkbox", checkbox: approved },
  },
});
export const githubIssue = (number = 7, state = "open", body = `<!-- feedbax:${ID} -->`) => ({
  number,
  state,
  body,
  html_url: `https://github.com/acme/app/issues/${number}`,
  closed_at: state === "closed" ? SINCE : null,
  updated_at: SINCE,
});
