import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { replaceIndex } from "#/server/library";

import { mediaSources } from "./index";

const library = () => {
  const db = createDatabase(":memory:");
  replaceIndex(db, "kavita", [
    {
      itemId: "1",
      libraryId: "3",
      format: "ebook",
      externalId: null,
      titles: ["Harry Potter", "Harry Potter et la Coupe de Feu"],
      author: "",
    },
  ]);
  return db;
};

describe("eBook ownership", () => {
  const goblet = {
    externalId: "383236",
    title: "Harry Potter and the Goblet of Fire",
    altTitles: ["Harry Potter und der Feuerkelch", "Harry Potter et la coupe de feu"],
  };

  it("recognizes a book held under a translation's title", () => {
    // An edition named like the series doesn't make the first volume owned.
    const stone = {
      externalId: "328491",
      title: "Harry Potter and the Philosopher's Stone",
      altTitles: ["Harry Potter", "Harry Potter à l'école des sorciers"],
      series: [{ name: "Harry Potter", position: "1" }],
    };
    expect(mediaSources.ebook.owned(library(), [goblet, stone])).toEqual(new Set(["383236"]));
  });

  it("ignores an edition titled like the start of the book's title", () => {
    const db = createDatabase(":memory:");
    replaceIndex(db, "kavita", [
      {
        itemId: "8",
        libraryId: "4",
        format: "ebook",
        externalId: null,
        titles: ["Solo Leveling"],
        author: "",
      },
    ]);
    const omnibus = {
      externalId: "1",
      title: "Solo Leveling: The Novel Omnibus",
      altTitles: ["Solo Leveling"],
      series: [{ name: "Solo Leveling (Novel)" }],
    };
    expect(mediaSources.ebook.owned(db, [omnibus]).size).toBe(0);
  });

  it("knows a book Chaptarr holds by its Hardcover id, as an exact match", () => {
    const db = createDatabase(":memory:");
    replaceIndex(db, "chaptarr", [
      {
        itemId: "16573",
        libraryId: "",
        format: "ebook",
        externalId: "hc:383236",
        titles: ["Harry Potter et la Coupe de Feu"],
        author: "J.K. Rowling",
      },
    ]);
    const item = { externalId: "383236", title: "Harry Potter and the Goblet of Fire" };
    expect(mediaSources.ebook.owned(db, [item], { exact: true })).toEqual(new Set(["383236"]));
  });

  it("doesn't count a title match as exact, and looks up many titles", () => {
    const db = library();
    expect(mediaSources.ebook.owned(db, [goblet], { exact: true }).size).toBe(0);
    const many = Array.from({ length: 1200 }, (_, index) => `Title ${index}`);
    const item = { ...goblet, altTitles: [...many, ...goblet.altTitles] };
    expect(mediaSources.ebook.owned(db, [item])).toEqual(new Set(["383236"]));
  });
});
