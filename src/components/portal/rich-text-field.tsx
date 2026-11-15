import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { MARKDOWN_NOTE } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// The seam for the rich-text editor. Every place that writes a body (the submit form, the
// comment form, /admin/changelog) renders this instead of a bare <Textarea>. The value is the
// Markdown subset of src/lib/markdown.ts and `onChange` receives Markdown.
//
// The editor chunk is loaded only on focus/click. Until it arrives — and if it fails — this textarea
// is the control, and a form can still submit it without the editor. Callers keep their state,
// drafts, limits and error handling.

export type RichTextVariant = "post" | "comment" | "changelog";

export type RichTextFieldProps = {
  id: string;
  /** Submitted with a surrounding <form> when set (the textarea fallback keeps it working without JS). */
  name?: string;
  value: string;
  onChange: (markdown: string) => void;
  maxLength: number;
  /** "comment" is the compact toolbar variant. */
  variant?: RichTextVariant;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Hide the "Markdown supported" hint (a caller that already explains the syntax). */
  hideHint?: boolean;
  className?: string;
  "aria-labelledby": string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type EditorComponent = typeof import("./rich-text-editor").RichTextEditor;

export function RichTextField({
  id,
  name,
  value,
  onChange,
  maxLength,
  variant = "post",
  rows = variant === "comment" ? 3 : 7,
  placeholder,
  disabled,
  hideHint,
  className,
  ...aria
}: RichTextFieldProps) {
  const [Editor, setEditor] = React.useState<EditorComponent | null>(null);
  const [requested, setRequested] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!requested) return;
    let live = true;
    // Do not run this on mount: reading a post must not download the writer.
    void import("./rich-text-editor")
      .then((mod) => {
        if (live) setEditor(() => mod.RichTextEditor);
      })
      .catch(() => {
        if (live) setRequested(false);
      });
    return () => {
      live = false;
    };
  }, [requested]);

  const ready = Editor && !composing;
  function activate() {
    if (!disabled) setRequested(true);
  }

  const hintId = `${id}-markdown`;
  const describedBy = [aria["aria-describedby"], hideHint ? undefined : hintId]
    .filter(Boolean)
    .join(" ");
  const invalid = aria["aria-invalid"];

  return (
    <div
      data-rich-text={variant}
      data-rich-text-mode={ready ? "editor" : "textarea"}
      className={cn(
        "flex flex-col gap-1",
        variant === "comment"
          ? "[--editor-toolbar-height:33px] max-md:[--editor-toolbar-height:49px]"
          : "[--editor-toolbar-height:37px] max-md:[--editor-toolbar-height:53px]",
      )}
    >
      {ready ? (
        <>
          <Editor
            id={id}
            autoFocus={focused.current}
            value={value}
            onChange={onChange}
            maxLength={maxLength}
            variant={variant}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            className={className}
            labelledBy={aria["aria-labelledby"]}
            describedBy={describedBy || undefined}
            invalid={invalid}
          />
          {name ? (
            <textarea name={name} value={value} readOnly hidden aria-hidden="true" tabIndex={-1} />
          ) : null}
        </>
      ) : (
        <Textarea
          id={id}
          name={name}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-labelledby={aria["aria-labelledby"]}
          role="textbox"
          aria-multiline="true"
          aria-invalid={invalid}
          aria-describedby={describedBy || undefined}
          onFocus={() => {
            focused.current = true;
            activate();
          }}
          onBlur={() => {
            focused.current = false;
          }}
          onClick={activate}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            onChange(event.currentTarget.value);
            setComposing(false);
          }}
          onChange={(event) => onChange(event.target.value)}
          // Reserve the toolbar as well as the body before importing its CSS.
          style={{
            minHeight: `calc(${rows * 1.5}rem + var(--editor-toolbar-height) + 2px)`,
            paddingTop: "calc(var(--editor-toolbar-height) + 0.5rem)",
          }}
          className={cn("max-md:text-base", className)}
        />
      )}
      {hideHint ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {MARKDOWN_NOTE}
        </p>
      )}
    </div>
  );
}
