import { describe, expect, it } from "vitest";

import { compareVersions } from "./version";

describe("compareVersions", () => {
  it("orders versions numerically, ignoring a leading v", () => {
    expect(compareVersions("0.10.0", "0.9.3")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "v1.3.0")).toBeLessThan(0);
  });
});
