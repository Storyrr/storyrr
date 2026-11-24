import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVER_LAYOUT, withNewBuiltInRows } from "./discover";

describe("Discover layout", () => {
  it("appends built-in rows a saved layout doesn't know, keeping its order and choices", () => {
    const saved = [
      { id: "trending_ebook", kind: "trending" as const, type: "ebook" as const, enabled: false },
      { id: "recently_added", kind: "recently_added" as const, enabled: true },
    ];
    const rows = withNewBuiltInRows(saved);
    expect(rows.slice(0, 2)).toEqual(saved);
    expect(rows.map((row) => row.id).toSorted()).toEqual(
      DEFAULT_DISCOVER_LAYOUT.map((row) => row.id).toSorted(),
    );
  });
});
