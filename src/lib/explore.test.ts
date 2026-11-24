import { describe, expect, it } from "vitest";

import { BookFiltersSchema, bookFilterCount, readFilters } from "./explore";

describe("explore filters", () => {
  it("drops values from the URL that don't fit, keeping the rest", () => {
    expect(
      readFilters(BookFiltersSchema, { sort: "bogus", yearFrom: 2000, language: "French" }),
    ).toMatchObject({ sort: undefined, yearFrom: 2000, language: undefined });
  });

  it("counts a range once", () => {
    expect(bookFilterCount({ yearFrom: 2000, yearTo: 2010, genres: ["fantasy"] })).toBe(2);
    expect(bookFilterCount({ genres: [] })).toBe(0);
  });
});
