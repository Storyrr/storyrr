import { afterEach, describe, expect, it } from "vitest";

import { baseLocale, getLocale, overwriteGetLocale } from "#/paraglide/runtime.js";

import { hardcoverTagName } from "./hardcover-tags";

const original = getLocale;

describe("hardcoverTagName", () => {
  afterEach(() => overwriteGetLocale(original));

  it("translates known genres and moods, whatever their spelling", () => {
    overwriteGetLocale(() => "fr");
    expect(hardcoverTagName("Science Fiction")).toBe("Science-fiction");
    expect(hardcoverTagName("fast paced")).toBe("Rythmé");
    expect(hardcoverTagName(" Mind & Spirit")).toBe("Esprit et spiritualité");
  });

  it("tidies the English names and keeps unknown ones", () => {
    overwriteGetLocale(() => baseLocale);
    expect(hardcoverTagName("social science")).toBe("Social Science");
    expect(hardcoverTagName("LitRPG")).toBe("LitRPG");
    expect(hardcoverTagName(" etc")).toBe("etc");
  });
});
