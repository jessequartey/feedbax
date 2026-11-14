import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { MARKDOWN_NOTE } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// The seam for the rich-text editor. Every place that writes a body (the submit form, the
// comment form, /admin/changelog) renders this instead of a bare <Textarea>. The value is the
// Markdown subset of src/lib/markdown.ts and `onChange` receives Markdown. Today it is a textarea
// with a one-line hint. The editor replaces the body of `RichTextField` (a lazy import that falls
// back to this textarea until it has loaded, or if it fails), and nothing else has to change:
// callers keep their state, drafts, limits and error handling.

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
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

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
  const hintId = `${id}-markdown`;
  const describedBy = [aria["aria-describedby"], hideHint ? undefined : hintId]
    .filter(Boolean)
    .join(" ");
  return (
    <div data-rich-text={variant} className="flex flex-col gap-1">
      <Textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn("max-md:text-base", className)}
      />
      {hideHint ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {MARKDOWN_NOTE}
        </p>
      )}
    </div>
  );
}
