import { describe, expect, it } from "vitest";

import { titleKey } from "./match";

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
