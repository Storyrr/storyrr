import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each(["/", "/requests", "/media/audiobook/B0?x=1#top"])("keeps the local path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    undefined,
    "",
    "requests",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
  ])("falls back to / for %s", (target) => {
    expect(safeRedirectPath(target)).toBe("/");
  });
});
