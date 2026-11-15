import * as React from "react";
import { EditorContent, Extension, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Blockquote from "@tiptap/extension-blockquote";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  CodeIcon,
  Heading3Icon,
  Heading4Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  SquareCodeIcon,
  TextQuoteIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeHref } from "@/lib/markdown";
import { normalizeMarkdown } from "@/lib/markdown-write";
import { cn } from "@/lib/utils";

import {
  editorDocToMarkdown,
  editorLinkHref,
  markdownToEditorDoc,
  type EditorNode,
} from "./rich-text-doc";
import "./rich-text-editor.css";

// WYSIWYG for the portal's Markdown subset. Imported lazily by RichTextField, so the board
// never downloads Tiptap. The schema is the subset: h3/h4, bold, italic, code, links, flat
// lists, quotes, code blocks. Underline, strike and horizontal rules are off. Links are
// checked with the same safeHref policy as storage.

export type RichTextEditorProps = {
  id: string;
  value: string;
  onChange: (markdown: string) => void;
  maxLength: number;
  variant: "post" | "comment" | "changelog";
  rows: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  describedBy?: string;
  invalid?: boolean;
};

const FlatListItem = ListItem.extend({ content: "paragraph" });
const FlatQuote = Blockquote.extend({ content: "paragraph+" });

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const mod = mac ? "⌘" : "Ctrl+";
const shift = mac ? "⇧" : "Shift+";
const alt = mac ? "⌥" : "Alt+";

function contentAttributes(
  id: string,
  describedBy: string | undefined,
  invalid: boolean | undefined,
  className: string | undefined,
  rows: number,
) {
  return {
    id,
    role: "textbox",
    "aria-multiline": "true",
    ...(invalid ? { "aria-invalid": "true" } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    class: cn("px-2.5 py-2 text-xs outline-none max-md:text-base", className),
    ...(className ? {} : { style: `min-height: ${rows * 1.5}rem` }),
  };
}

export function RichTextEditor({
  id,
  value,
  onChange,
  maxLength,
  variant,
  rows,
  placeholder,
  disabled,
  className,
  describedBy,
  invalid,
}: RichTextEditorProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const maxRef = React.useRef(maxLength);
  maxRef.current = maxLength;
  const placeholderRef = React.useRef(placeholder);
  placeholderRef.current = placeholder;
  const emittedRef = React.useRef(value);
  const reverting = React.useRef(false);
  const openLinkRef = React.useRef<() => void>(() => {});
  const initialValue = React.useRef(value);

  const extensions = React.useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        strike: false,
        underline: false,
        horizontalRule: false,
        link: false,
        listItem: false,
        blockquote: false,
      }),
      FlatListItem,
      FlatQuote,
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        markdownLinks: false,
        protocols: ["http", "https", "mailto"],
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener nofollow ugc", target: "_blank" },
        isAllowedUri: (url) => safeHref(url) !== null,
        shouldAutoLink: (url) => safeHref(url) !== null,
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current ?? "",
      }),
      Extension.create({
        name: "feedbaxKeys",
        addKeyboardShortcuts() {
          return {
            "Mod-k": () => {
              openLinkRef.current();
              return true;
            },
            "Mod-Shift-8": () => this.editor.commands.toggleBulletList(),
            "Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
          };
        },
      }),
    ],
    [],
  );

  const publish = React.useCallback((current: Editor) => {
    if (reverting.current) return;
    const next = editorDocToMarkdown(current.getJSON() as EditorNode);
    if (next.length > maxRef.current) {
      reverting.current = true;
      const undone = current.commands.undo();
      if (!undone) {
        current.commands.setContent(markdownToEditorDoc(emittedRef.current), { emitUpdate: false });
      }
      reverting.current = false;
      return;
    }
    const stored = valueRef.current;
    if (next === stored || next === normalizeMarkdown(stored)) return;
    emittedRef.current = next;
    onChangeRef.current(next);
  }, []);

  const editor = useEditor({
    immediatelyRender: true,
    editable: !disabled,
    extensions,
    content: markdownToEditorDoc(initialValue.current),
    editorProps: {
      attributes: contentAttributes(id, describedBy, invalid, className, rows),
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (transaction.docChanged) publish(current);
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      link: current.isActive("link"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      code: current.isActive("code"),
      codeBlock: current.isActive("codeBlock"),
      h3: current.isActive("heading", { level: 3 }),
      h4: current.isActive("heading", { level: 4 }),
      canBold: current.can().toggleBold(),
      canItalic: current.can().toggleItalic(),
      canBullet: current.can().toggleBulletList(),
      canOrdered: current.can().toggleOrderedList(),
      canQuote: current.can().toggleBlockquote(),
      canCode: current.can().toggleCode(),
      canCodeBlock: current.can().toggleCodeBlock(),
      canH3: current.can().toggleHeading({ level: 3 }),
      canH4: current.can().toggleHeading({ level: 4 }),
    }),
  });

  React.useEffect(() => {
    editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  React.useEffect(() => {
    editor.setOptions({
      editorProps: { attributes: contentAttributes(id, describedBy, invalid, className, rows) },
    });
  }, [editor, id, describedBy, invalid, className, rows]);

  React.useEffect(() => {
    if (value === emittedRef.current) return;
    const current = editorDocToMarkdown(editor.getJSON() as EditorNode);
    if (current === value || current === normalizeMarkdown(value)) {
      emittedRef.current = value;
      return;
    }
    emittedRef.current = value;
    editor.commands.setContent(markdownToEditorDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [linkHad, setLinkHad] = React.useState(false);
  const selectionRef = React.useRef<{ from: number; to: number } | null>(null);

  const openLink = React.useCallback(() => {
    const { from, to } = editor.state.selection;
    selectionRef.current = { from, to };
    const href = editor.getAttributes("link").href;
    setLinkUrl(typeof href === "string" ? href : "");
    setLinkError(null);
    setLinkHad(editor.isActive("link"));
    setLinkOpen(true);
  }, [editor]);
  openLinkRef.current = openLink;

  function applyLink() {
    const href = editorLinkHref(linkUrl);
    if (!href) {
      setLinkError("Use an http, https, or mailto link.");
      return;
    }
    const saved = selectionRef.current;
    const chain = editor.chain().focus();
    if (saved) chain.setTextSelection(saved);
    if (!saved || saved.from === saved.to) {
      chain.insertContent({
        type: "text",
        text: href.replace(/^mailto:/, ""),
        marks: [{ type: "link", attrs: { href } }],
      });
    } else {
      chain.extendMarkRange("link").setLink({ href });
    }
    chain.run();
    setLinkOpen(false);
  }

  function removeLink() {
    const saved = selectionRef.current;
    const chain = editor.chain().focus();
    if (saved) chain.setTextSelection(saved);
    chain.extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  const compact = variant === "comment";

  return (
    <div
      data-rich-text-editor={variant}
      className={cn(
        "feedbax-editor border border-input bg-transparent dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
        invalid &&
          "border-destructive ring-1 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div
        role="toolbar"
        aria-label={compact ? "Comment formatting" : "Formatting"}
        className={cn("flex flex-wrap items-center gap-0.5 border-b", compact ? "p-0.5" : "p-1")}
      >
        <ToolButton
          label="Bold"
          shortcut={`${mod}B`}
          pressed={active.bold}
          disabled={disabled || !active.canBold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Italic"
          shortcut={`${mod}I`}
          pressed={active.italic}
          disabled={disabled || !active.canItalic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Link"
          shortcut={`${mod}K`}
          pressed={active.link || linkOpen}
          disabled={disabled}
          onClick={openLink}
        >
          <LinkIcon aria-hidden="true" />
        </ToolButton>
        <Bar />
        <ToolButton
          label="Bullet list"
          shortcut={`${mod}${shift}8`}
          pressed={active.bullet}
          disabled={disabled || !active.canBullet}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          shortcut={`${mod}${shift}7`}
          pressed={active.ordered}
          disabled={disabled || !active.canOrdered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon aria-hidden="true" />
        </ToolButton>
        <Bar />
        <ToolButton
          label="Quote"
          shortcut={`${mod}${shift}B`}
          pressed={active.quote}
          disabled={disabled || !active.canQuote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <TextQuoteIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Inline code"
          shortcut={`${mod}E`}
          pressed={active.code}
          disabled={disabled || !active.canCode}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Code block"
          shortcut={`${mod}${alt}C`}
          pressed={active.codeBlock}
          disabled={disabled || !active.canCodeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <SquareCodeIcon aria-hidden="true" />
        </ToolButton>
        {compact ? null : (
          <>
            <Bar />
            <ToolButton
              label="Heading"
              shortcut={`${mod}${alt}3`}
              pressed={active.h3}
              disabled={disabled || !active.canH3}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3Icon aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Small heading"
              shortcut={`${mod}${alt}4`}
              pressed={active.h4}
              disabled={disabled || !active.canH4}
              onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            >
              <Heading4Icon aria-hidden="true" />
            </ToolButton>
          </>
        )}
      </div>
      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-1 border-b px-1 py-1">
          <Input
            aria-label="Link URL"
            value={linkUrl}
            placeholder="https://…"
            autoFocus
            disabled={disabled}
            className="h-7 min-w-40 flex-1"
            onChange={(event) => {
              setLinkUrl(event.target.value);
              setLinkError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setLinkOpen(false);
                editor.commands.focus();
              }
            }}
          />
          <Button type="button" size="sm" disabled={disabled} onClick={applyLink}>
            Apply
          </Button>
          {linkHad ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={removeLink}
            >
              Remove
            </Button>
          ) : null}
          {linkError ? <p className="w-full text-xs text-destructive">{linkError}</p> : null}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function Bar() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />;
}

function ToolButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const name = `${label} (${shortcut})`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={name}
      title={name}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn("max-md:size-11", pressed && "bg-muted text-foreground")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
