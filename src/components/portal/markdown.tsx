import * as React from "react";

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// Renders the safe Markdown subset (src/lib/markdown.ts) as React elements. Nothing here uses
// dangerouslySetInnerHTML: every string reaches the DOM as text.

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
                rel="noopener nofollow"
                {...(node.href.startsWith("/") ? {} : { target: "_blank" })}
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

const HEADINGS = { 1: "h3", 2: "h4", 3: "h5" } as const;

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="break-words">
          <Inlines nodes={block.children} />
        </p>
      );
    case "heading": {
      const Tag = HEADINGS[block.level];
      return (
        <Tag className="mt-2 font-semibold break-words">
          <Inlines nodes={block.children} />
        </Tag>
      );
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("ml-5 space-y-1", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, index) => (
            <li key={index} className="break-words">
              <Inlines nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 pl-4 text-muted-foreground">
          <Inlines nodes={block.children} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto border bg-muted/40 p-3 font-mono text-sm">
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr className="my-2" />;
  }
}

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
