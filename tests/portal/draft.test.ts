import { describe, expect, it } from "vite-plus/test";

import {
  POST_DRAFT_KEY,
  clearDraft,
  commentDraftKey,
  loadDraft,
  parseCommentDraft,
  parsePostDraft,
  saveDraft,
  type StorageLike,
} from "../../src/components/portal/draft.ts";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("drafts kept across /login", () => {
  it("saves and restores a post draft", () => {
    const storage = memoryStorage();
    const draft = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "T",
      body: "B",
      category: "bug",
    } as const;
    saveDraft(POST_DRAFT_KEY, draft, storage);
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)).toEqual(draft);
    clearDraft(POST_DRAFT_KEY, storage);
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)).toBeNull();
  });

  it("keeps a category-only draft when switching between dialog and full-page forms", () => {
    const storage = memoryStorage();
    const draft = { id: "draft-id", title: "", body: "", category: "general" } as const;
    saveDraft(POST_DRAFT_KEY, draft, storage);
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)).toEqual(draft);
    saveDraft(POST_DRAFT_KEY, { ...draft, title: "Continue on the full page" }, storage);
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)?.title).toBe(
      "Continue on the full page",
    );
  });

  it("never stores images, even if they are passed along", () => {
    const storage = memoryStorage();
    saveDraft(POST_DRAFT_KEY, { id: "i", title: "T", body: "B", category: "feature" }, storage);
    expect(storage.data.get(POST_DRAFT_KEY)).not.toMatch(/image|blob|data:/);
  });

  it("ignores corrupt or hand-edited drafts", () => {
    const storage = memoryStorage();
    storage.setItem(POST_DRAFT_KEY, "{not json");
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)).toBeNull();
    storage.setItem(
      POST_DRAFT_KEY,
      JSON.stringify({ id: "x", title: 1, body: "b", category: "bug" }),
    );
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)).toBeNull();
    storage.setItem(
      POST_DRAFT_KEY,
      JSON.stringify({ id: "x", title: "t", body: "b", category: "nope" }),
    );
    expect(loadDraft(POST_DRAFT_KEY, parsePostDraft, storage)).toBeNull();
  });

  it("keeps one comment draft per post", () => {
    const storage = memoryStorage();
    saveDraft(commentDraftKey("a"), { id: "1", body: "hello" }, storage);
    saveDraft(commentDraftKey("b"), { id: "2", body: "other" }, storage);
    expect(loadDraft(commentDraftKey("a"), parseCommentDraft, storage)).toEqual({
      id: "1",
      body: "hello",
    });
    expect(loadDraft(commentDraftKey("b"), parseCommentDraft, storage)?.body).toBe("other");
  });

  it("survives storage that throws", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveDraft("k", {}, broken)).not.toThrow();
    expect(loadDraft("k", () => 1, broken)).toBeNull();
    expect(() => clearDraft("k", broken)).not.toThrow();
  });
});
