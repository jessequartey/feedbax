import * as React from "react";

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// The one renderer for stored Markdown (src/lib/markdown.ts): post pages, comments, the
// changelog and admin moderation all use it, so a body looks the same everywhere. Nothing here
// uses dangerouslySetInnerHTML: every string reaches the DOM as text. Whitespace is kept as
// typed (pre-wrap), so plain text written before formatting existed looks as it always did.

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <React.Fragment key={index}>{node.text}</React.Fragment>;
          case "break":
            return <br key={index} />;
          case "code":
            return (
              <code key={index} className="bg-muted px-1 py-0.5 font-mono text-[0.9em]">
                {node.text}
              </code>
            );
          case "strong":
            return (
              <strong key={index} className="font-semibold">
                <Inlines nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <Inlines nodes={node.children} />
              </em>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                rel="noopener nofollow ugc"
                target="_blank"
                className="underline underline-offset-4 hover:text-foreground"
              >
                <Inlines nodes={node.children} />
              </a>
            );
        }
      })}
    </>
  );
}

const HEADINGS = { 3: "h3", 4: "h4" } as const;

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="break-words whitespace-pre-wrap">
          <Inlines nodes={block.children} />
        </p>
      );
    case "heading": {
      const Tag = HEADINGS[block.level];
      return (
        <Tag className="mt-2 font-semibold break-words whitespace-pre-wrap">
          <Inlines nodes={block.children} />
        </Tag>
      );
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={cn("ml-5 space-y-1", block.ordered ? "list-decimal" : "list-disc")}
          {...(block.ordered && block.start !== 1 ? { start: block.start } : {})}
        >
          {block.items.map((item, index) => (
            <li key={index} className="break-words whitespace-pre-wrap">
              <Inlines nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 pl-4 break-words whitespace-pre-wrap text-muted-foreground">
          <Inlines nodes={block.children} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto border bg-muted/40 p-3 font-mono text-sm">
          <code>{block.text}</code>
        </pre>
      );
  }
}

/** `className` replaces the default text size and spacing (`text-sm space-y-2` for comments). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={cn("space-y-3 text-base leading-relaxed", className)}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
