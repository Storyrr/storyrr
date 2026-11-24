import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { userSettings } from "#/server/settings/definitions";
import { createSettingsStore } from "#/server/settings/store";

import { permissionsOf, setUserPermissions } from "./permissions";

describe("permissionsOf", () => {
  it("uses the defaults until the user has their own, and gives admins everything", async () => {
    const db = createDatabase(":memory:");
    const settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
    await db.insert(user).values({ id: "b", name: "Bob", email: "b@example.com" });
    const deps = { db, settings };

    expect(await permissionsOf(deps, { id: "b" })).toEqual([
      "request_audiobook",
      "request_ebook",
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
