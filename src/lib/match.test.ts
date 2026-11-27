import { describe, expect, it } from "vitest";

import { parentPath, pathKey, titleKey } from "./match";

describe("titleKey", () => {
  it.each([
    ["Le Petit Prince!", "le petit prince"],
    ["L'Étranger", "l etranger"],
    ["Pride & Prejudice", "pride and prejudice"],
    ["  Dune:   Messiah ", "dune messiah"],
    ["ワンピース", "ワンピース"],
  ])("%s → %s", (title, key) => {
    expect(titleKey(title)).toBe(key);
  });
});

describe("pathKey", () => {
  it("is the same for one file mounted at two places", () => {
    const chaptarr = "/data/ebooks/J.K. Rowling/Harry Potter et la Coupe de Feu/hp4.epub";
    const kavita = "/ebooks/J.K. Rowling/Harry Potter et la Coupe de Feu/hp4.epub";
    expect(pathKey(chaptarr)).toBe("harry potter et la coupe de feu/hp4.epub");
    expect(pathKey(kavita)).toBe(pathKey(chaptarr));
  });

  it("matches an audiobook's folder to the folder of one of its files", () => {
    const file = "/data/audiobooks/Terry Goodkind/La Machine à Présages/01.mp3";
    expect(parentPath(file)).toBe("/data/audiobooks/Terry Goodkind/La Machine à Présages");
    expect(pathKey(parentPath(file))).toBe(
      pathKey("C:\\audiobooks\\Terry Goodkind\\La Machine à Présages\\"),
    );
  });
});
