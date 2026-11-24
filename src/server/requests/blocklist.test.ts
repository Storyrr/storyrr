import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

import { block, blockedIds, findBlock, listBlocklist, unblock } from "./blocklist";

let db: AppDatabase;
const dune = {
  type: "ebook" as const,
  source: "hardcover",
  externalId: "312460",
  title: "Dune",
  coverUrl: undefined,
};

beforeEach(async () => {
  db = createDatabase(":memory:");
  await db.insert(user).values({ id: "admin", name: "Admin", email: "admin@example.com" });
});

describe("blocklist", () => {
  it("blocks per provider id, once, and unblocks", () => {
    const id = block(db, dune, { reason: "never on our trackers", userId: "admin" });
    expect(block(db, dune, { reason: "updated", userId: "admin" })).toBe(id);
    expect(blockedIds(db, "hardcover", ["312460", "1"])).toEqual(new Set(["312460"]));
    expect(blockedIds(db, "audible", ["312460"]).size).toBe(0);
    expect(findBlock(db, "hardcover", "312460")?.reason).toBe("updated");
    expect(listBlocklist(db)).toMatchObject([{ id, title: "Dune", createdByName: "Admin" }]);
    expect(unblock(db, id)).toBe(true);
    expect(unblock(db, id)).toBe(false);
    expect(blockedIds(db, "hardcover", ["312460"]).size).toBe(0);
  });
});
