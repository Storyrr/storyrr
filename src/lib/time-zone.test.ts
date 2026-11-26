import { describe, expect, it } from "vitest";

import { validTimeZone } from "./time-zone";

describe("validTimeZone", () => {
  it("keeps a zone Intl knows and drops anything else", () => {
    expect(validTimeZone("Europe/Paris")).toBe("Europe/Paris");
    expect(validTimeZone("Not/AZone")).toBeUndefined();
    expect(validTimeZone("")).toBeUndefined();
    expect(validTimeZone(undefined)).toBeUndefined();
    expect(validTimeZone("x".repeat(100))).toBeUndefined();
  });
});
