import { parseMarkdown, type Block, type Inline } from "#/lib/markdown";
import { cn } from "#/lib/utils";

function InlineNodes({ nodes }: { nodes: readonly Inline[] }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
        return <span key={index}>{node.text}</span>;
      case "code":
        return (
          // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
          <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {node.text}
          </code>
        );
      case "strong":
        return (
          // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
          <strong key={index} className="font-semibold">
            <InlineNodes nodes={node.children} />
          </strong>
        );
      case "emphasis":
        return (
          // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
          <em key={index}>
            <InlineNodes nodes={node.children} />
          </em>
        );
      default:
        return (
          <a
            // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
            key={index}
            href={node.href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            <InlineNodes nodes={node.children} />
          </a>
        );
    }
  });
}

const HEADINGS = {
  1: "text-xl font-semibold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
} as const;

function BlockNode({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      // Under the dialog's own title: the notes' headings start one level down.
      const Tag = block.level <= 2 ? "h3" : "h4";
      return (
        <Tag className={cn("font-heading", HEADINGS[block.level])}>
          <InlineNodes nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineNodes nodes={block.children} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={cn("flex flex-col gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}
        >
          {block.items.map((item, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
            <li key={index}>
              <InlineNodes nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
          <code>{block.text}</code>
        </pre>
      );
    default:
      return <hr className="border-border" />;
  }
}

/** Markdown (release notes) as elements: never as HTML, so nothing in it can run. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>
      {parseMarkdown(source).map((block, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- static content, never reordered
        <BlockNode key={index} block={block} />
      ))}
    </div>
  );
}
