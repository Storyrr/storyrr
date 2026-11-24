import { describe, expect, it } from "vitest";

import { readLogs, recordLog } from "./logs";

describe("logs", () => {
  it("filters by minimum level and text, newest first", () => {
    recordLog("info", "library sync done", 1);
    recordLog("warn", "Chaptarr slow", 2);
    recordLog("error", "Kavita sync failed", 3);
    expect(
      readLogs({ minLevel: "warn" })
        .map((e) => e.message)
        .slice(0, 2),
    ).toEqual(["Kavita sync failed", "Chaptarr slow"]);
    expect(
      readLogs({ search: "SYNC" })
        .map((e) => e.message)
        .slice(0, 2),
    ).toEqual(["Kavita sync failed", "library sync done"]);
  });
});
