import { describe, expect, it } from "vitest";

import {
  groupBySeries,
  isCollectionPosition,
  seriesAvailability,
  type AnnotatedTitle,
} from "./series";

const title = (
  id: string,
  series?: { id: string; name: string; position?: string },
  extra: Partial<AnnotatedTitle> = {},
): AnnotatedTitle => ({
  type: "ebook",
  source: "hardcover",
  externalId: id,
  title: `Title ${id}`,
  authors: ["Author"],
  narrators: [],
  series: series ? [series] : [],
  coverUrl: `cover-${id}`,
  availability: "none",
  accepted: true,
  ...extra,
});

const comic = { id: "s1", name: "Solo Leveling (Comic)" };

describe("groupBySeries", () => {
  it("folds a series' volumes into one entry at its first volume's place", () => {
    const entries = groupBySeries([
      title("a", { ...comic, position: "3" }),
      title("b"),
      title("c", { ...comic, position: "1" }),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(["series", "title"]);
    expect(entries[0]).toMatchObject({
      kind: "series",
      // The lowest volume found gives the cover.
      series: { id: "s1", name: "Solo Leveling (Comic)", coverUrl: "cover-c", accepted: true },
    });
  });

  it("keeps titles whose series has no id as titles", () => {
    const entries = groupBySeries([title("a", { id: "", name: "No id" })]);
    expect(entries).toEqual([
      { kind: "title", item: expect.objectContaining({ externalId: "a" }) },
    ]);
  });

  it("refuses a series only when every known volume is refused", () => {
    const [mixed] = groupBySeries([
      title("a", comic, { accepted: false }),
      title("b", comic, { accepted: null }),
    ]);
    const [refused] = groupBySeries([
      title("a", comic, { accepted: false }),
      title("b", comic, { accepted: false }),
    ]);
    expect(mixed?.kind === "series" && mixed.series.accepted).toBeNull();
    expect(refused?.kind === "series" && refused.series.accepted).toBe(false);
  });

  it("adds series found by series search after the titles, merging those already there", () => {
    const entries = groupBySeries(
      [title("a", comic)],
      [
        { id: "s1", name: "Solo Leveling (Comic)", booksCount: 15, accepted: false },
        {
          id: "s2",
          name: "Solo Leveling (French Numbering)",
          author: "Chugong",
          booksCount: 21,
          accepted: true,
        },
      ],
    );
    expect(entries).toMatchObject([
      { kind: "series", series: { id: "s1", booksCount: 15, accepted: true } },
      {
        kind: "series",
        series: { id: "s2", authors: ["Chugong"], booksCount: 21, accepted: true },
      },
    ]);
  });
});

describe("seriesAvailability", () => {
  it("is available when every volume is, partial when some are", () => {
    expect(seriesAvailability([{ availability: "available" }, { availability: "available" }])).toBe(
      "available",
    );
    expect(seriesAvailability([{ availability: "available" }, { availability: "none" }])).toBe(
      "partial",
    );
    expect(seriesAvailability([{ availability: "processing" }, { availability: "none" }])).toBe(
      "requested",
    );
    expect(seriesAvailability([{ availability: "none" }])).toBe("none");
    expect(seriesAvailability([])).toBe("none");
  });
});

describe("isCollectionPosition", () => {
  it("tells box sets (a range of volumes) from volumes", () => {
    for (const position of ["0-3", "1-3", "0, 3", "1 & 2", "1–5"])
      expect(isCollectionPosition(position)).toBe(true);
    for (const position of ["1", "0.5", "12", "Book 3", undefined])
      expect(isCollectionPosition(position)).toBe(false);
  });
});
