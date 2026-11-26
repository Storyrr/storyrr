/**
 * A small Markdown reader for release notes (GitHub releases written by
 * release-please, plus a hand-written introduction): headings, lists,
 * paragraphs, code blocks, rules, and bold / italic / code / links inline. It
 * builds a tree, never HTML, so nothing in the notes can run in the page; raw
 * HTML in the source shows as text.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "emphasis"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string }
  | { type: "rule" };

/** Links may only open the web: no `javascript:` or other schemes. */
const safeHref = (href: string) => (/^https?:\/\//i.test(href) ? href : null);

// One alternative per inline construct, tried in order at each position.
const INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+(?:\*[^*]+)*?)\*\*|\*([^*\s][^*]*)\*|(?<![\w/])_([^_\s][^_]*)_(?!\w)|(https?:\/\/[^\s<>)\]]+)/g;

export function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];
  const text = (value: string) => {
    if (value) nodes.push({ type: "text", text: value });
  };
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    const [whole, code, label, target, strong, star, underscore, bare] = match;
    text(source.slice(last, match.index));
    last = match.index + whole.length;
    if (code !== undefined) nodes.push({ type: "code", text: code });
    else if (label !== undefined && target !== undefined) {
      const href = safeHref(target);
      if (href) nodes.push({ type: "link", href, children: parseInline(label) });
      else text(label);
    } else if (strong !== undefined) nodes.push({ type: "strong", children: parseInline(strong) });
    else if (star !== undefined) nodes.push({ type: "emphasis", children: parseInline(star) });
    else if (underscore !== undefined)
      nodes.push({ type: "emphasis", children: parseInline(underscore) });
    else if (bare !== undefined)
      nodes.push({ type: "link", href: bare, children: [{ type: "text", text: bare }] });
  }
  text(source.slice(last));
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(```|~~~)/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0)
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (
        i++;
        i < lines.length && !(lines[i] ?? "").trimStart().startsWith(fence[1] ?? "```");
        i++
      )
        body.push(lines[i] ?? "");
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1]?.length ?? 1, 4);
      blocks.push({
        type: "heading",
        level: level === 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4,
        children: parseInline(heading[2] ?? ""),
      });
      continue;
    }
    const item = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (item) {
      flush();
      const ordered = !BULLET.test(line);
      const previous = blocks.at(-1);
      const list =
        previous?.type === "list" && previous.ordered === ordered
          ? previous
          : { type: "list" as const, ordered, items: [] };
      if (list !== previous) blocks.push(list);
      list.items.push(parseInline(item[1] ?? ""));
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
