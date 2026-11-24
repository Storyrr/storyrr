import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";
import { setUserPermissions } from "#/server/permissions";

import { listUsers } from "./users";

describe("users", () => {
  it("lists accounts with their own permissions, null when the defaults apply", async () => {
    const db = createDatabase(":memory:");
    await db.insert(user).values([
      { id: "a", name: "Admin", email: "a@example.com", role: "admin" },
      { id: "b", name: "Bob", email: "b@example.com" },
    ]);
    setUserPermissions(db, "b", ["request_ebook"]);
    expect(listUsers(db).map((u) => [u.name, u.role, u.permissions, u.requests])).toEqual([
      ["Admin", "admin", null, 0],
      ["Bob", null, ["request_ebook"], 0],
    ]);
  });
});
