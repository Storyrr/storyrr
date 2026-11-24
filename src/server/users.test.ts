import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

import { listUsers, setAutoApprove } from "./users";

describe("users", () => {
  it("lists accounts with their auto-approval, defaulting to off", async () => {
    const db = createDatabase(":memory:");
    await db.insert(user).values([
      { id: "a", name: "Admin", email: "a@example.com", role: "admin" },
      { id: "b", name: "Bob", email: "b@example.com" },
    ]);
    setAutoApprove(db, "b", true);
    setAutoApprove(db, "b", false);
    setAutoApprove(db, "b", true);
    expect(listUsers(db).map((u) => [u.name, u.role, u.autoApprove, u.requests])).toEqual([
      ["Admin", "admin", false, 0],
      ["Bob", null, true, 0],
    ]);
  });
});
