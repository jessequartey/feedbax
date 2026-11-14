import { describe, expect, test } from "vite-plus/test";
import {
  draftReducer,
  emptyDraft,
  hasContent,
  uuid,
  type Draft,
} from "../../registry/feedbax-feedback/lib/draft.ts";

type A = { id: string; label: string };
let n = 0;
const newId = () => `id-${++n}`;
const reduce = (s: Draft<A>, a: Parameters<typeof draftReducer<A>>[1]) =>
  draftReducer<A>(s, a, newId);

describe("draft", () => {
  test("uuid() makes version-4 UUIDs", () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(uuid());
  });

  test("the post id is stable while the draft is edited before any failure", () => {
    let s = emptyDraft<A>("first");
    s = reduce(s, { type: "title", value: "Hi" });
    s = reduce(s, { type: "body", value: "There" });
    s = reduce(s, { type: "category", value: "bug" });
    s = reduce(s, { type: "attach", attachment: { id: "a", label: "x" } });
    expect(s.id).toBe("first");
  });

  test("a failed submit keeps the draft, its images and its id for the retry", () => {
    let s = emptyDraft<A>("first");
    s = reduce(s, { type: "title", value: "Hi" });
    s = reduce(s, { type: "attach", attachment: { id: "a", label: "x" } });
    const before = s;
    s = reduce(s, { type: "failed" });
    expect(s.id).toBe("first");
    expect(s.title).toBe(before.title);
    expect(s.attachments).toEqual(before.attachments);
  });

  test("editing after a failure starts a new post id; later edits keep it", () => {
    let s = reduce(reduce(emptyDraft<A>("first"), { type: "title", value: "Hi" }), {
      type: "failed",
    });
    s = reduce(s, { type: "title", value: "Hi!" });
    const second = s.id;
    expect(second).not.toBe("first");
    expect(s.failed).toBe(false);
    s = reduce(s, { type: "body", value: "more" });
    expect(s.id).toBe(second);
  });

  test("changing the images after a failure also counts as an edit", () => {
    for (const action of [
      { type: "attach", attachment: { id: "b", label: "y" } },
      { type: "remove", id: "a" },
      { type: "update", id: "a", attachment: { id: "a", label: "annotated" } },
    ] as const) {
      let s = reduce(emptyDraft<A>("first"), {
        type: "attach",
        attachment: { id: "a", label: "x" },
      });
      s = reduce(reduce(s, { type: "failed" }), action);
      expect(s.id).not.toBe("first");
    }
  });

  test("replace and update swap an attachment in place; remove drops it", () => {
    let s = reduce(
      reduce(emptyDraft<A>("x"), { type: "attach", attachment: { id: "a", label: "1" } }),
      { type: "attach", attachment: { id: "b", label: "2" } },
    );
    s = reduce(s, { type: "replace", id: "a", attachment: { id: "c", label: "3" } });
    expect(s.attachments.map((a) => a.id)).toEqual(["c", "b"]);
    s = reduce(s, { type: "remove", id: "b" });
    expect(s.attachments.map((a) => a.id)).toEqual(["c"]);
  });

  test("reset returns an empty draft with the given id; hasContent tells when to confirm a discard", () => {
    expect(hasContent(emptyDraft<A>("x"))).toBe(false);
    expect(hasContent(reduce(emptyDraft<A>("x"), { type: "title", value: "  " }))).toBe(false);
    const s = reduce(emptyDraft<A>("x"), { type: "body", value: "hello" });
    expect(hasContent(s)).toBe(true);
    expect(reduce(s, { type: "reset", id: "fresh" })).toEqual(emptyDraft("fresh"));
  });
});
