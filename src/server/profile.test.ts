import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

import { setUserLocale, userLocale } from "./profile";
import { setUserPermissions } from "./permissions";

describe("profile", () => {
  it("stores the display language without touching other preferences", async () => {
    const db = createDatabase(":memory:");
    await db.insert(user).values({ id: "b", name: "Bob", email: "b@example.com" });
    expect(userLocale(db, "b")).toBeNull();
    setUserPermissions(db, "b", ["request_ebook"]);
    setUserLocale(db, "b", "fr");
    expect(userLocale(db, "b")).toBe("fr");
    setUserLocale(db, "b", null);
    expect(userLocale(db, "b")).toBeNull();
  });
});
