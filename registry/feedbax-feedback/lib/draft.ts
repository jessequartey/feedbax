// The feedback draft as a pure reducer, so id and retry rules can be tested without a DOM.
import type { Category } from "./types";

export type Draft<A> = {
  /** Client-generated post id: the portal's idempotency key. */
  id: string;
  title: string;
  body: string;
  category: Category | null;
  attachments: A[];
  /** A submit failed with this draft. Editing it now starts a new post id. */
  failed: boolean;
};

export type DraftAction<A extends { id: string }> =
  | { type: "title"; value: string }
  | { type: "body"; value: string }
  | { type: "category"; value: Category }
  | { type: "attach"; attachment: A }
  | { type: "replace"; id: string; attachment: A }
  | { type: "update"; id: string; attachment: A }
  | { type: "remove"; id: string }
  | { type: "failed" }
  | { type: "reset"; id: string };

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const emptyDraft = <A>(id: string): Draft<A> => ({
  id,
  title: "",
  body: "",
  category: null,
  attachments: [],
  failed: false,
});

export const hasContent = <A>(d: Draft<A>) =>
  d.title.trim() !== "" || d.body.trim() !== "" || d.attachments.length > 0;

export function draftReducer<A extends { id: string }>(
  state: Draft<A>,
  action: DraftAction<A>,
  newId: () => string = uuid,
): Draft<A> {
  if (action.type === "reset") return emptyDraft(action.id);
  if (action.type === "failed") return { ...state, failed: true };
  // Any other action edits the draft. After a failed submit that means a new post id.
  const base: Draft<A> = state.failed ? { ...state, id: newId(), failed: false } : state;
  switch (action.type) {
    case "title":
      return { ...base, title: action.value };
    case "body":
      return { ...base, body: action.value };
    case "category":
      return { ...base, category: action.value };
    case "attach":
      return { ...base, attachments: [...base.attachments, action.attachment] };
    case "replace":
    case "update":
      return {
        ...base,
        attachments: base.attachments.map((a) => (a.id === action.id ? action.attachment : a)),
      };
    case "remove":
      return { ...base, attachments: base.attachments.filter((a) => a.id !== action.id) };
  }
}
