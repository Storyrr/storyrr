import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

import { ownerId } from "./owner";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 24, 0, minutes));

describe("ownerId", () => {
  it("is the oldest administrator, not an older user", async () => {
    const db = createDatabase(":memory:");
    expect(ownerId(db)).toBeNull();
    await db.insert(user).values([
      { id: "u", name: "User", email: "u@example.com", role: "user", createdAt: at(0) },
      { id: "a2", name: "Admin 2", email: "a2@example.com", role: "admin", createdAt: at(2) },
      { id: "a1", name: "Owner", email: "a1@example.com", role: "admin", createdAt: at(1) },
    ]);
    expect(ownerId(db)).toBe("a1");
  });
});
