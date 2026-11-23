import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";

import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("reports ok with the app version when the database answers", () => {
    const report = checkHealth(createDatabase(":memory:"));
    expect(report).toEqual({
      status: "ok",
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      checks: { database: "ok" },
    });
  });

  it("reports an error when the database is unavailable", () => {
    const db = createDatabase(":memory:");
    db.$client.close();
    const report = checkHealth(db);
    expect(report.status).toBe("error");
    expect(report.checks.database).toBe("error");
  });
});
