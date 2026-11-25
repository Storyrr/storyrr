import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { userSettings } from "#/server/settings/definitions";
import { createSettingsStore } from "#/server/settings/store";

import { expandPermissions } from "#/lib/permissions";

import { accountLock, permissionsOf, setUserPermissions } from "./permissions";

describe("permissionsOf", () => {
  it("uses the defaults until the user has their own, and gives admins everything", async () => {
    const db = createDatabase(":memory:");
    const settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
    await db.insert(user).values({ id: "b", name: "Bob", email: "b@example.com" });
    const deps = { db, settings };

    expect(await permissionsOf(deps, { id: "b" })).toEqual([
      "request_audiobook",
      "request_ebook",
      "view_requests",
      "create_issues",
    ]);
    await settings.set(userSettings, {
      defaultPermissions: ["request_ebook"],
      requestLimits: {
        audiobook: { limit: null, days: 7 },
        ebook: { limit: null, days: 7 },
      },
    });
    expect(await permissionsOf(deps, { id: "b" })).toEqual(["request_ebook"]);
    setUserPermissions(db, "b", ["manage_requests"]);
    expect(await permissionsOf(deps, { id: "b" })).toContain("auto_approve_audiobook");
    expect(await permissionsOf(deps, { id: "b", role: "admin" })).toContain("manage_settings");
  });
});

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

describe("accountLock", () => {
  it("lets a user manager change only accounts with no permission they lack", async () => {
    const db = createDatabase(":memory:");
    const settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
    await db.insert(user).values([
      { id: "owner", name: "O", email: "o@example.com", role: "admin", createdAt: day(1) },
      { id: "admin", name: "A", email: "a@example.com", role: "admin", createdAt: day(2) },
      { id: "plain", name: "P", email: "p@example.com", createdAt: day(3) },
      { id: "settings", name: "S", email: "s@example.com", createdAt: day(4) },
    ]);
    setUserPermissions(db, "settings", ["manage_settings"]);
    const deps = { db, settings };
    const manager = expandPermissions([
      "manage_users",
      "view_requests",
      "request_audiobook",
      "request_ebook",
      "create_issues",
    ]);
    const admin = expandPermissions(["admin"]);

    expect(await accountLock(deps, manager, { id: "plain" })).toBeNull();
    expect(await accountLock(deps, manager, { id: "settings" })).toBe("outranked");
    expect(await accountLock(deps, manager, { id: "admin", role: "admin" })).toBe("admin_only");
    expect(await accountLock(deps, admin, { id: "settings" })).toBeNull();
    expect(await accountLock(deps, admin, { id: "owner", role: "admin" })).toBe("owner");
  });
});
