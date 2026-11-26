import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("reads release-please notes: headings, lists, scopes and commit links", () => {
    const blocks = parseMarkdown(
      [
        "## [0.1.1](https://github.com/Storyrr/storyrr/compare/v0.1.0...v0.1.1) (2026-11-26)",
        "",
        "### 🐛 Bug Fixes",
        "",
        "* **auth:** keep the limiters out ([1cc9763](https://github.com/Storyrr/storyrr/commit/1cc9763))",
        "* escape `<!channel>` in Slack",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual(["heading", "heading", "list"]);
    expect(blocks[0]).toMatchObject({ level: 2, children: [{ type: "link" }, { type: "text" }] });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [
        [
          { type: "strong", children: [{ type: "text", text: "auth:" }] },
          { type: "text", text: " keep the limiters out (" },
          { type: "link", href: "https://github.com/Storyrr/storyrr/commit/1cc9763" },
          { type: "text", text: ")" },
        ],
        [{ type: "text" }, { type: "code", text: "<!channel>" }, { type: "text" }],
      ],
    });
  });

  it("reads paragraphs, code blocks, rules and numbered lists", () => {
    const blocks = parseMarkdown(
      "First line\nsame paragraph.\n\n```yaml\nservices:\n  storyrr: {}\n```\n\n---\n\n1. one\n2. two",
    );
    expect(blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "First line same paragraph." }] },
      { type: "code", text: "services:\n  storyrr: {}" },
      { type: "rule" },
      {
        type: "list",
        ordered: true,
        items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]],
      },
    ]);
  });
});

describe("parseInline", () => {
  it("keeps only web links, and leaves HTML as text", () => {
    expect(parseInline("[x](javascript:alert(1)) <script>alert(1)</script>")).toEqual([
      { type: "text", text: "x" },
      { type: "text", text: ") <script>alert(1)</script>" },
    ]);
    expect(parseInline("see https://storyrr.github.io now")).toMatchObject([
      { type: "text" },
      { type: "link", href: "https://storyrr.github.io" },
      { type: "text", text: " now" },
    ]);
  });

  it("doesn't read underscores inside words or addresses as emphasis", () => {
    expect(parseInline("MANAGE_USERS and _really_")).toEqual([
      { type: "text", text: "MANAGE_USERS and " },
      { type: "emphasis", children: [{ type: "text", text: "really" }] },
    ]);
  });
});
