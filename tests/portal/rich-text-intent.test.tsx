// @vitest-environment happy-dom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loader = vi.hoisted(() => ({ load: vi.fn() }));
import { RichTextField } from "../../src/components/portal/rich-text-field";

let container: HTMLDivElement;
let root: Root;
let resolveEditor: (module: object) => void;
let rejectEditor: (error: Error) => void;

function FakeEditor({ value, autoFocus }: { value: string; autoFocus?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div ref={ref} tabIndex={0} role="textbox" data-editor>
      {value}
    </div>
  );
}
function Field({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = React.useState("");
  return (
    <>
      <RichTextField
        id="comment"
        name="body"
        aria-labelledby="comment-label"
        value={value}
        onChange={setValue}
        maxLength={2000}
        variant="comment"
        disabled={disabled}
      />
      <button>Next</button>
    </>
  );
}
async function render(disabled = false) {
  await act(async () => root.render(<Field disabled={disabled} />));
  return container.querySelector("textarea")!;
}
async function finish() {
  await vi.waitFor(() => expect(loader.load).toHaveBeenCalled());
  await act(async () => resolveEditor({ RichTextEditor: FakeEditor }));
}
async function type(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    // Bypass React's value tracker, like a native edit.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      textarea,
      value,
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  loader.load.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        resolveEditor = resolve;
        rejectEditor = reject;
      }),
  );
  vi.doMock("../../src/components/portal/rich-text-editor", () => loader.load());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.doUnmock("../../src/components/portal/rich-text-editor");
  vi.unstubAllGlobals();
  // Each test gets a fresh lazy import, including rejection/retry cases.
  vi.resetModules();
});

describe("editor loading intent", () => {
  it("does not import on mount; keeps early typing and focus when it resolves", async () => {
    const textarea = await render();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(loader.load).not.toHaveBeenCalled();
    await act(async () => textarea.focus());
    await vi.waitFor(() => expect(loader.load).toHaveBeenCalledTimes(1));
    await type(textarea, "Typed before the editor arrived");
    expect(textarea.value).toBe("Typed before the editor arrived");
    await finish();
    const editor = container.querySelector("[data-editor]")!;
    expect(editor.textContent).toBe("Typed before the editor arrived");
    expect(document.activeElement).toBe(editor);
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.value).toBe(
      editor.textContent,
    );
  });

  it("does not steal focus if the user tabs away while loading", async () => {
    const textarea = await render();
    await act(async () => textarea.focus());
    const next = container.querySelector("button")!;
    await act(async () => next.focus());
    await finish();
    expect(document.activeElement).toBe(next);
  });

  it("waits for an IME composition to finish before replacing the textarea", async () => {
    const textarea = await render();
    await act(async () => {
      textarea.focus();
      textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    await type(textarea, "日本語");
    await finish();
    expect(container.querySelector("[data-editor]")).toBeNull();
    await act(async () =>
      textarea.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })),
    );
    expect(container.querySelector("[data-editor]")?.textContent).toBe("日本語");
  });

  it("keeps an editable textarea and its value if the import fails", async () => {
    const textarea = await render();
    await act(async () => textarea.focus());
    await type(textarea, "Safe draft");
    await vi.waitFor(() => expect(loader.load).toHaveBeenCalled());
    await act(async () => rejectEditor(new Error("offline")));
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    await type(textarea, "Safe draft, still editable");
    expect(textarea.value).toBe("Safe draft, still editable");
  });

  it("does not import a disabled field on click", async () => {
    const textarea = await render(true);
    await act(async () => textarea.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(loader.load).not.toHaveBeenCalled();
  });
});
