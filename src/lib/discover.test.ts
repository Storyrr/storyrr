import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISCOVER_LAYOUT,
  DiscoverLayoutSchema,
  StoredDiscoverLayoutSchema,
  withNewBuiltInRows,
} from "./discover";

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

  const manga = {
    id: "manga",
    kind: "filtered",
    enabled: true,
    title: "Manga",
    type: "ebook",
    filters: { sort: "popular", genres: ["manga"], language: "fr", hideOwned: true },
  };

  it("keeps a filtered row with its format's filters", () => {
    expect(v.parse(DiscoverLayoutSchema, [manga])).toEqual([manga]);
  });

  it("refuses a filtered row with a sort of the other format", () => {
    const row = { ...manga, type: "audiobook", filters: { sort: "popular" } };
    expect(v.safeParse(DiscoverLayoutSchema, [row]).success).toBe(false);
  });

  it("drops stored rows that no longer fit, such as old search rows, and keeps the rest", () => {
    const search = { id: "s", kind: "search", enabled: true, type: "ebook", query: "manga" };
    const trending = { id: "trending_ebook", kind: "trending", type: "ebook", enabled: true };
    expect(v.parse(StoredDiscoverLayoutSchema, [search, manga, trending])).toEqual([
      manga,
      trending,
    ]);
  });
});
