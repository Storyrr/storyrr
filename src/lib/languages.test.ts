import { describe, expect, it } from "vitest";

import { canonicalLanguage, isLanguageAccepted, parseAllowedLanguages } from "./languages";

describe("canonicalLanguage", () => {
  it.each([
    ["fre", "fra"],
    ["fra", "fra"],
    ["FR", "fra"],
    ["ger", "deu"],
    ["eng", "eng"],
    ["french", "fra"],
    ["English", "eng"],
    ["", null],
    ["klingon", null],
  ])("%s → %s", (code, expected) => {
    expect(canonicalLanguage(code)).toBe(expected);
  });
});

describe("Chaptarr language policy", () => {
  const frenchOnly = parseAllowedLanguages("fre,fra");

  it("parses the profile's codes and the unknown marker", () => {
    expect(frenchOnly).toEqual({ allowed: ["fra"], allowUnknown: false });
    expect(parseAllowedLanguages("eng, null")).toEqual({ allowed: ["eng"], allowUnknown: true });
    expect(parseAllowedLanguages("")).toBeNull();
  });

  it("accepts a work with at least one edition in an allowed language", () => {
    expect(isLanguageAccepted(frenchOnly, ["eng"])).toBe(false);
    expect(isLanguageAccepted(frenchOnly, ["eng", "fra"])).toBe(true);
    expect(isLanguageAccepted(frenchOnly, [null])).toBe(false);
    expect(isLanguageAccepted({ allowed: ["fra"], allowUnknown: true }, [null])).toBe(true);
  });

  it("doesn't judge when the policy or the languages are unknown", () => {
    expect(isLanguageAccepted(null, ["eng"])).toBeNull();
    expect(isLanguageAccepted(frenchOnly, undefined)).toBeNull();
  });
});
